import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HARNESS_HOME, readJson, writeJson, writeText, HarnessError } from './util.mjs';
import { SKILLS_DIR, allSkills } from './team.mjs';

/**
 * Third-party skills are vendored: copied into skills/vendor/ from a pinned commit, with
 * their licence and provenance, so the team's instructions cannot change underneath it
 * and everything an agent will read can be reviewed in this repository.
 *
 * skills/sources.json lists what to vendor:
 *   { name, repo, commit, path, license, roles, why, extra: [{ from, to }] }
 * `extra` copies shared files a skill links to from elsewhere in its repo.
 */

const SOURCES = path.join(SKILLS_DIR, 'sources.json');
const VENDOR = path.join(SKILLS_DIR, 'vendor');
const CACHE = path.join(HARNESS_HOME, '.cache', 'repos');

const run = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();

export const loadSources = () => readJson(SOURCES, []);

/** Fetch exactly one commit of a repository into the local cache. */
function checkout(repo, commit) {
  const key = `${repo.replace(/^https:\/\/github\.com\//, '').replace(/[^a-zA-Z0-9._-]+/g, '__')}@${commit.slice(0, 12)}`;
  const dir = path.join(CACHE, key);
  if (fs.existsSync(path.join(dir, '.git'))) {
    try {
      if (run(dir, ['rev-parse', 'HEAD']) === commit) return dir;
    } catch {
      // fall through and fetch again
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  run(dir, ['init', '-q']);
  run(dir, ['remote', 'add', 'origin', repo]);
  run(dir, ['-c', 'protocol.version=2', 'fetch', '-q', '--depth', '1', 'origin', commit]);
  run(dir, ['-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD']);
  return dir;
}

function copyDir(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    dereference: false,
    // Never bring a nested repository or dependency folder into the team's skills.
    filter: (src) => !/(^|\/)(\.git|node_modules|__pycache__)(\/|$)/.test(src.slice(from.length)),
  });
}

function findLicense(repoDir, skillDir) {
  for (const dir of [skillDir, repoDir]) {
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

/** Vendor every skill in sources.json (or only `names`). Returns { installed, failed }. */
export function installSkills({ names, force = false, log = () => {} } = {}) {
  const sources = loadSources().filter((s) => !names || names.includes(s.name));
  if (!sources.length) throw new HarnessError('Nothing to install: skills/sources.json has no matching entries.');
  const installed = [];
  const failed = [];

  for (const src of sources) {
    const target = path.join(VENDOR, src.name);
    const marker = path.join(target, '.source.json');
    if (!force && fs.existsSync(marker) && readJson(marker).commit === src.commit) {
      installed.push({ name: src.name, cached: true });
      continue;
    }
    try {
      const repoDir = checkout(src.repo, src.commit);
      const skillDir = path.join(repoDir, src.path);
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) throw new Error(`no SKILL.md at ${src.path}`);
      fs.rmSync(target, { recursive: true, force: true });
      copyDir(skillDir, target);
      for (const extra of src.extra ?? []) {
        const from = path.join(repoDir, extra.from);
        const to = path.join(target, extra.to);
        if (!to.startsWith(target + path.sep)) throw new Error(`extra path escapes the skill folder: ${extra.to}`);
        if (fs.existsSync(from)) copyDir(from, to);
      }
      const license = findLicense(repoDir, skillDir);
      if (license && !fs.existsSync(path.join(target, path.basename(license)))) {
        fs.copyFileSync(license, path.join(target, 'LICENSE.upstream'));
      }
      writeJson(marker, {
        name: src.name,
        repo: src.repo,
        commit: src.commit,
        path: src.path,
        license: src.license,
        vendored: new Date().toISOString().slice(0, 10),
      });
      installed.push({ name: src.name });
      log(`vendored ${src.name}`);
    } catch (err) {
      failed.push({ name: src.name, error: String(err.stderr || err.message).trim().split('\n').pop() });
      log(`FAILED ${src.name}: ${failed.at(-1).error}`);
    }
  }
  writeNotices();
  return { installed, failed };
}

/** Attribution for everything vendored, as several of the licences require. */
function writeNotices() {
  if (!fs.existsSync(VENDOR)) return;
  const rows = [];
  for (const name of fs.readdirSync(VENDOR).sort()) {
    const marker = path.join(VENDOR, name, '.source.json');
    if (!fs.existsSync(marker)) continue;
    const s = readJson(marker);
    rows.push(`| ${s.name} | ${s.repo} | \`${s.path}\` | \`${s.commit.slice(0, 12)}\` | ${s.license ?? 'see upstream'} |`);
  }
  writeText(
    path.join(SKILLS_DIR, 'THIRD_PARTY.md'),
    [
      '# Third-party skills',
      '',
      'Skills under `skills/vendor/` are unmodified copies from the repositories below, at the pinned commit.',
      'Each folder keeps its upstream licence. Generated by `harness skills install`; do not edit by hand.',
      '',
      '| Skill | Repository | Path | Commit | Licence |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
}

/**
 * Patterns that deserve a human look before an agent is allowed to follow a skill.
 * This is a tripwire, not a guarantee: read anything it flags.
 */
const SUSPICIOUS = [
  { id: 'pipe-to-shell', re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i },
  { id: 'encoded-exec', re: /base64\s+(-d|--decode)[^\n]*\|\s*(ba|z)?sh\b/i },
  { id: 'ignore-instructions', re: /ignore (all |any )?(previous|prior|above) (instructions|rules)/i },
  { id: 'hide-from-user', re: /do not (tell|inform|mention to) the user/i },
  { id: 'credential-read', re: /(\.ssh\/id_|\.aws\/credentials|auth\.json|\.netrc|keychain)/i },
  { id: 'token-in-request', re: /(gh auth token|GITHUB_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)[^\n]*(curl|fetch|requests?\.|http)/i },
  { id: 'global-install', re: /\b(npm (i|install) (-g|--global)|pip install --user|brew install|sudo )/i },
  { id: 'telemetry', re: /\b(send|sends|report|reports|collect|collects|upload|uploads)\b[^\n]{0,40}\b(telemetry|usage (data|statistics))\b|DO_NOT_TRACK|attribution (header|env|variable)/i },
];

const TEXT_FILE = /\.(md|txt|ya?ml|json|sh|bash|zsh|py|js|mjs|cjs|ts|rb|toml)$/i;

export function auditSkills() {
  const findings = [];
  for (const skill of allSkills()) {
    const stack = [skill.dir];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && TEXT_FILE.test(entry.name) && fs.statSync(full).size < 2_000_000) {
          const lines = fs.readFileSync(full, 'utf8').split('\n');
          lines.forEach((line, i) => {
            for (const rule of SUSPICIOUS) {
              if (rule.re.test(line)) {
                findings.push({
                  skill: skill.name,
                  root: skill.root,
                  rule: rule.id,
                  file: path.relative(skill.dir, full),
                  line: i + 1,
                  text: line.trim().slice(0, 160),
                });
              }
            }
          });
        }
      }
    }
  }
  return findings;
}

/** Save a skill the team wrote for itself after a retrospective. Returns the folder, or null if rejected. */
export function writeLearnedSkill({ name, description, body }) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const desc = String(description ?? '').replace(/\s+/g, ' ').trim().slice(0, 900);
  const text = String(body ?? '').trim();
  if (!safe || desc.length < 20 || text.length < 200 || text.length > 20_000) return null;
  const dir = path.join(SKILLS_DIR, 'learned', safe);
  writeText(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${safe}\ndescription: ${JSON.stringify(desc)}\n---\n\n${text}\n`,
  );
  return { name: safe, dir };
}
