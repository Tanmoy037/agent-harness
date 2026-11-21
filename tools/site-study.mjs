#!/usr/bin/env node
/**
 * site-study: capture how a real page looks and what it is made of.
 *
 *   node site-study.mjs <url> --out <dir> [--industry "<name>"] [--path /pricing ...]
 *                       [--no-library] [--wait <ms>] [--ignore-robots]
 *
 * For the page (and each extra --path) it saves, under <out>/<host>/:
 *   <page>-desktop.png, <page>-desktop-fold.png, <page>-mobile.png, <page>-mobile-fold.png
 *   styles.json   the fonts, type sizes, colours, spacing, radii and shadows actually in use
 *   summary.md    the same, readable, with the screenshot list
 *
 * Designers use it to study live products before designing, and everyone uses it with
 * --no-library to look at the team's own pages (prototype, built product) at both widths.
 *
 * It behaves like an ordinary visitor: one load per page, no login, no evasion. A site
 * that blocks automated visitors is reported as blocked, not worked around.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parse(argv) {
  const out = { paths: [], library: true, wait: 1500, ignoreRobots: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--industry') out.industry = argv[++i];
    else if (a === '--path') out.paths.push(argv[++i]);
    else if (a === '--wait') out.wait = Number(argv[++i]) || 1500;
    else if (a === '--no-library') out.library = false;
    else if (a === '--ignore-robots') out.ignoreRobots = true;
    else if (!a.startsWith('--') && !out.url) out.url = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.url || !out.out) throw new Error('Usage: node site-study.mjs <url> --out <dir> [--industry "<name>"] [--path /x ...] [--no-library]');
  if (fs.existsSync(out.url)) out.url = `file://${path.resolve(out.url)}`; // a local HTML file
  else if (!/^(https?|file):\/\//.test(out.url)) out.url = `https://${out.url}`;
  return out;
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const MAX_SHOT_HEIGHT = 14000;

const isLocal = (u) => /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(new URL(u).hostname) || u.startsWith('file:');

/** Skip a site whose robots.txt closes it to all automated visitors. */
async function robotsAllows(url) {
  try {
    const res = await fetch(new URL('/robots.txt', url), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true;
    const text = await res.text();
    let applies = false;
    for (const raw of text.split('\n')) {
      const line = raw.split('#')[0].trim();
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(key)) applies = value === '*';
      else if (applies && /^disallow$/i.test(key) && value === '/') return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function launch() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(`Playwright is not installed. Run: (cd ${HERE} && npm install)`);
  }
  // Prefer the Chrome already on the machine; fall back to Playwright's own Chromium.
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      throw new Error(`No browser available. Install Google Chrome, or run: (cd ${HERE} && npx playwright install chromium)`);
    }
  }
}

/** Runs in the page: measure what the design is actually made of. */
function extractStyles() {
  const toHex = (value) => {
    const m = value && value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
    if (Number(a) < 0.08) return null;
    const hex = [r, g, b].map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
    return `#${hex}${Number(a) < 0.995 ? Math.round(Number(a) * 255).toString(16).padStart(2, '0') : ''}`;
  };
  const tally = (map, key, weight = 1) => {
    if (key === null || key === undefined || key === '') return;
    map.set(key, (map.get(key) || 0) + weight);
  };
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  const firstFamily = (ff) => ff.split(',')[0].trim().replace(/^["']|["']$/g, '');

  const fonts = new Map(), sizes = new Map(), weights = new Map(), lineHeights = new Map(), tracking = new Map();
  const textColors = new Map(), backgrounds = new Map(), borders = new Map();
  const radii = new Map(), shadows = new Map(), spacing = new Map(), gradients = new Map();
  let animated = 0, transitioned = 0, widest = 0, blurred = 0;

  const elements = [...document.querySelectorAll('body *')].slice(0, 6000);
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const area = Math.min(rect.width * rect.height, 2_000_000) / 10_000;

    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
    if (ownText.length > 1) {
      const w = Math.min(ownText.length, 400);
      tally(fonts, firstFamily(cs.fontFamily), w);
      tally(sizes, `${Math.round(parseFloat(cs.fontSize) * 10) / 10}px`, w);
      tally(weights, cs.fontWeight, w);
      const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
      if (Number.isFinite(lh)) tally(lineHeights, (Math.round(lh * 20) / 20).toFixed(2), w);
      if (cs.letterSpacing !== 'normal' && cs.letterSpacing !== '0px') {
        tally(tracking, `${(parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize)).toFixed(3)}em`, w);
      }
      tally(textColors, toHex(cs.color), w);
    }
    tally(backgrounds, toHex(cs.backgroundColor), area);
    if (cs.backgroundImage.includes('gradient')) tally(gradients, cs.backgroundImage.slice(0, 160), area);
    if (parseFloat(cs.borderTopWidth) > 0) tally(borders, toHex(cs.borderTopColor), 1);
    if (cs.borderTopLeftRadius !== '0px') tally(radii, cs.borderTopLeftRadius, 1);
    if (cs.boxShadow !== 'none') tally(shadows, cs.boxShadow.slice(0, 140), 1);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') blurred++;
    for (const prop of ['paddingTop', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = parseFloat(cs[prop]);
      if (v >= 2 && v <= 240) tally(spacing, `${Math.round(v)}px`, 1);
    }
    if (cs.animationName !== 'none') animated++;
    if (cs.transitionDuration !== '0s') transitioned++;
    if (rect.width < innerWidth * 0.96 && rect.width > widest &&['MAIN', 'SECTION', 'DIV', 'ARTICLE'].includes(el.tagName) && el.children.length > 1) widest = rect.width;
  }

  const describe = (el) => {
    const cs = getComputedStyle(el);
    return {
      text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 110),
      font: firstFamily(cs.fontFamily),
      size: cs.fontSize,
      weight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      transform: cs.textTransform,
      color: toHex(cs.color),
    };
  };
  const control = (el) => {
    const cs = getComputedStyle(el);
    return {
      text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50),
      background: toHex(cs.backgroundColor),
      color: toHex(cs.color),
      radius: cs.borderTopLeftRadius,
      padding: `${cs.paddingTop} ${cs.paddingRight}`,
      font: `${cs.fontWeight} ${cs.fontSize} ${firstFamily(cs.fontFamily)}`,
      border: parseFloat(cs.borderTopWidth) > 0 ? `${cs.borderTopWidth} ${toHex(cs.borderTopColor)}` : 'none',
      shadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 100),
    };
  };

  const rootVars = {};
  try {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
          for (const name of rule.style) {
            if (name.startsWith('--') && Object.keys(rootVars).length < 120) rootVars[name] = rule.style.getPropertyValue(name).trim().slice(0, 80);
          }
        }
      }
    }
  } catch { /* cross-origin stylesheets cannot be read */ }

  const bodyStyle = getComputedStyle(document.body);
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content ?? '',
    themeColor: document.querySelector('meta[name="theme-color"]')?.content ?? '',
    generator: document.querySelector('meta[name="generator"]')?.content ?? '',
    pageBackground: toHex(bodyStyle.backgroundColor) ?? toHex(getComputedStyle(document.documentElement).backgroundColor),
    fonts: top(fonts, 8),
    loadedFontFaces: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/["']/g, '')} ${f.weight} ${f.style}`))].slice(0, 40),
    typeSizes: top(sizes, 14),
    fontWeights: top(weights, 8),
    lineHeights: top(lineHeights, 8),
    letterSpacing: top(tracking, 6),
    textColors: top(textColors, 10),
    backgroundColors: top(backgrounds, 12),
    borderColors: top(borders, 6),
    gradients: top(gradients, 6),
    radii: top(radii, 8),
    shadows: top(shadows, 6),
    spacing: top(spacing, 16),
    contentWidth: Math.round(widest),
    headings: ['h1', 'h2', 'h3'].flatMap((tag) => [...document.querySelectorAll(tag)].slice(0, tag === 'h1' ? 2 : 4).map((el) => ({ tag, ...describe(el) }))),
    bodyText: (() => {
      const p = [...document.querySelectorAll('p')].find((el) => el.textContent.trim().length > 80);
      return p ? describe(p) : null;
    })(),
    buttons: [...document.querySelectorAll('button, a[class*="btn" i], a[class*="button" i], [role="button"]')].filter((el) => el.getBoundingClientRect().width > 40).slice(0, 6).map(control),
    navLinks: [...document.querySelectorAll('nav a, header a')].slice(0, 14).map((a) => a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)).filter(Boolean),
    counts: {
      images: document.images.length,
      svgs: document.querySelectorAll('svg').length,
      videos: document.querySelectorAll('video').length,
      canvases: document.querySelectorAll('canvas').length,
      forms: document.forms.length,
      animatedElements: animated,
      elementsWithTransitions: transitioned,
      backdropBlurElements: blurred,
    },
    cssVariables: rootVars,
    pageHeight: document.documentElement.scrollHeight,
  };
}

async function capturePage(browser, url, device, files, dir, slug, wait) {
  const context = await browser.newContext({ ...VIEWPORTS[device], ignoreHTTPSErrors: isLocal(url) });
  const page = await context.newPage();
  const fontFiles = new Set();
  page.on('response', (res) => {
    const u = res.url();
    if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) fontFiles.add(u.split('?')[0]);
  });
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const status = response?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(wait);

    // Scroll through once so lazy content and scroll-triggered sections render, then return to the top.
    await page.evaluate(async () => {
      const step = Math.max(400, innerHeight * 0.8);
      for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 30000); y += step) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(500);

    const fold = path.join(dir, `${slug}-${device}-fold.png`);
    await page.screenshot({ path: fold });
    files.push(fold);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const full = path.join(dir, `${slug}-${device}.png`);
    if (height > MAX_SHOT_HEIGHT) {
      await page.screenshot({ path: full, clip: { x: 0, y: 0, width: VIEWPORTS[device].viewport.width, height: MAX_SHOT_HEIGHT }, fullPage: true });
    } else {
      await page.screenshot({ path: full, fullPage: true });
    }
    files.push(full);

    const styles = device === 'desktop' ? await page.evaluate(extractStyles) : null;
    const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
    const blocked = status === 403 || status === 429 || status === 503 || /verify you are human|are you a robot|access denied|captcha|unusual traffic|just a moment/i.test(text);
    return { status, blocked, styles, fontFiles: [...fontFiles] };
  } finally {
    await context.close();
  }
}

function renderSummary(result) {
  const s = result.pages[0]?.styles;
  const list = (items, fmt = (i) => `\`${i.value}\``) => (items?.length ? items.map(fmt).join(', ') : 'none detected');
  const lines = [
    `# ${result.host}`,
    '',
    `- URL: ${result.url}`,
    `- Captured: ${result.captured}`,
    result.industry ? `- Industry: ${result.industry}` : null,
    s ? `- Title: ${s.title}` : null,
    s?.description ? `- Description: ${s.description}` : null,
    '',
    '## Screenshots',
    ...result.files.map((f) => `- ${path.basename(f)}`),
  ].filter((l) => l !== null);

  if (s) {
    lines.push(
      '',
      '## Typography',
      `- Typefaces in use (by amount of text): ${list(s.fonts)}`,
      `- Font files loaded: ${result.pages[0].fontFiles.length ? result.pages[0].fontFiles.slice(0, 10).map((f) => `\`${f.split('/').pop()}\``).join(', ') : 'none (system or inlined fonts)'}`,
      `- Type sizes: ${list(s.typeSizes)}`,
      `- Weights: ${list(s.fontWeights)}`,
      `- Line heights (ratio): ${list(s.lineHeights)}`,
      `- Letter spacing: ${list(s.letterSpacing)}`,
      ...s.headings.slice(0, 6).map((h) => `- ${h.tag}: "${h.text}" — ${h.font}, ${h.size}, weight ${h.weight}, line-height ${h.lineHeight}, tracking ${h.letterSpacing}${h.transform !== 'none' ? `, ${h.transform}` : ''}`),
      s.bodyText ? `- Body: ${s.bodyText.font}, ${s.bodyText.size}, weight ${s.bodyText.weight}, line-height ${s.bodyText.lineHeight}, colour ${s.bodyText.color}` : '- Body: not detected',
      '',
      '## Colour',
      `- Page background: \`${s.pageBackground}\``,
      `- Backgrounds (by area): ${list(s.backgroundColors)}`,
      `- Text colours: ${list(s.textColors)}`,
      `- Border colours: ${list(s.borderColors)}`,
      `- Gradients: ${s.gradients.length ? s.gradients.map((g) => `\`${g.value}\``).join('; ') : 'none'}`,
      '',
      '## Shape, depth and space',
      `- Corner radii: ${list(s.radii)}`,
      `- Shadows: ${s.shadows.length ? s.shadows.map((g) => `\`${g.value}\``).join('; ') : 'none'}`,
      `- Spacing values in use: ${list(s.spacing)}`,
      `- Main content width at 1440: ${s.contentWidth}px`,
      `- Backdrop-blur elements: ${s.counts.backdropBlurElements}`,
      '',
      '## Components and content',
      ...s.buttons.slice(0, 4).map((b) => `- Button "${b.text}": background ${b.background}, text ${b.color}, radius ${b.radius}, padding ${b.padding}, ${b.font}, border ${b.border}`),
      `- Navigation: ${s.navLinks.join(' · ') || 'not detected'}`,
      `- Media: ${s.counts.images} images, ${s.counts.svgs} SVGs, ${s.counts.videos} videos, ${s.counts.canvases} canvases`,
      `- Motion: ${s.counts.animatedElements} animated elements, ${s.counts.elementsWithTransitions} with transitions`,
      `- Page height at 1440: ${s.pageHeight}px`,
    );
  }
  for (const p of result.pages) {
    if (p.blocked) lines.push('', `> ${p.url} appears to block automated visitors (status ${p.status}). The screenshots may show a challenge page. Do not try to get around it; study this site from its public marketing material or choose another.`);
  }
  lines.push('', 'These are measurements, not conclusions. Look at the screenshots, and write the analysis yourself.', '');
  return lines.join('\n');
}

async function main() {
  const args = parse(process.argv.slice(2));
  const base = new URL(args.url);
  const host = (base.hostname.replace(/^www\./, '') + (base.port ? `-${base.port}` : '')) || 'local';
  const dir = path.resolve(args.out, host);
  fs.mkdirSync(dir, { recursive: true });

  if (!isLocal(args.url) && !args.ignoreRobots && !(await robotsAllows(args.url))) {
    console.log(JSON.stringify({ ok: false, host, reason: 'robots.txt closes this site to automated visitors; choose another reference or study it by hand.' }));
    process.exit(2);
  }

  const targets = [args.url, ...args.paths.map((p) => new URL(p, base).toString())];
  const browser = await launch();
  const result = { url: args.url, host, industry: args.industry ?? null, captured: new Date().toISOString(), dir, files: [], pages: [] };
  try {
    for (const target of targets) {
      const pathname = new URL(target).pathname;
      // A local file is named after the file; a web page after its path.
      const source = target.startsWith('file:') ? path.basename(pathname).replace(/\.html?$/i, '') : pathname.replace(/^\/|\/$/g, '');
      const slug = (source.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'home').slice(-48);
      const entry = { url: target, slug };
      for (const device of ['desktop', 'mobile']) {
        try {
          const shot = await capturePage(browser, target, device, result.files, dir, slug, args.wait);
          entry.status = shot.status;
          entry.blocked = entry.blocked || shot.blocked;
          if (shot.styles) {
            entry.styles = shot.styles;
            entry.fontFiles = shot.fontFiles;
          }
        } catch (err) {
          entry.error = `${device}: ${err.message.split('\n')[0]}`;
        }
      }
      entry.fontFiles ??= [];
      result.pages.push(entry);
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(dir, 'styles.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(dir, 'summary.md'), renderSummary(result));

  const first = result.pages[0];
  const usable = first?.styles && !first.blocked;
  if (args.library && usable && !isLocal(args.url)) {
    try {
      const { addToDesignLibrary } = await import('../src/memory.mjs');
      addToDesignLibrary({
        url: args.url,
        host,
        industry: args.industry ?? null,
        title: first.styles.title,
        fonts: first.styles.fonts.slice(0, 3).map((f) => f.value),
        palette: [first.styles.pageBackground, ...first.styles.backgroundColors.slice(0, 3).map((x) => x.value), ...first.styles.textColors.slice(0, 2).map((x) => x.value)].filter(Boolean),
        lastStudied: result.captured.slice(0, 10),
        capture: dir,
      });
    } catch (err) {
      console.error(`Could not add to the design library: ${err.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: Boolean(first?.styles),
        host,
        blocked: result.pages.filter((p) => p.blocked).map((p) => p.url),
        errors: result.pages.filter((p) => p.error).map((p) => p.error),
        summary: path.join(dir, 'summary.md'),
        styles: path.join(dir, 'styles.json'),
        screenshots: result.files,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
