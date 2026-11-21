import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

/**
 * A fast, deterministic census of a codebase, made before any agent reads a line of it.
 *
 * It is built from `git ls-files`, so it scales to very large repositories and ignores
 * build output. The engineers use it to decide how to divide the codebase for the survey:
 * no single agent can hold a huge product in its head, so the work is split by area.
 */

const LANGUAGES = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  cs: 'C#', vb: 'Visual Basic', fs: 'F#', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++', hxx: 'C++', c: 'C', h: 'C/C++ header',
  m: 'Objective-C', mm: 'Objective-C++', swift: 'Swift', php: 'PHP', pl: 'Perl', pm: 'Perl', lua: 'Lua', r: 'R',
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hs: 'Haskell', clj: 'Clojure', dart: 'Dart', groovy: 'Groovy',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', bat: 'Batch', cmd: 'Batch',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SCSS', less: 'Less', vue: 'Vue', svelte: 'Svelte',
  cbl: 'COBOL', cob: 'COBOL', f90: 'Fortran', f: 'Fortran', pas: 'Pascal', asm: 'Assembly', s: 'Assembly',
  tf: 'Terraform', bicep: 'Bicep', proto: 'Protobuf', graphql: 'GraphQL', gql: 'GraphQL',
  yaml: 'YAML', yml: 'YAML', json: 'JSON', xml: 'XML', toml: 'TOML', md: 'Markdown', mdx: 'Markdown',
  aspx: 'ASP.NET', cshtml: 'ASP.NET', razor: 'ASP.NET', xaml: 'XAML', jsp: 'JSP', erb: 'ERB',
};

const NOT_CODE = new Set(['YAML', 'JSON', 'XML', 'TOML', 'Markdown']);

const SIGNALS = [
  { kind: 'manifest', re: /(^|\/)(package\.json|pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json|pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile|Gemfile|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|composer\.json|mix\.exs|pubspec\.yaml|Package\.swift|CMakeLists\.txt|Makefile|BUILD(\.bazel)?|WORKSPACE(\.bazel)?|[^/]+\.(sln|csproj|vcxproj|fsproj))$/ },
  { kind: 'ci', re: /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|Jenkinsfile[^/]*|azure-pipelines[^/]*\.ya?ml|\.circleci\/config\.yml|bitbucket-pipelines\.yml|\.buildkite\/[^/]+|\.travis\.yml|cloudbuild\.ya?ml|\.drone\.yml)$/ },
  { kind: 'deploy', re: /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|vercel\.json|railway\.(json|toml)|fly\.toml|netlify\.toml|render\.ya?ml|Procfile|serverless\.ya?ml|app\.ya?ml|wrangler\.(toml|jsonc?)|firebase\.json|skaffold\.ya?ml|Chart\.yaml|kustomization\.ya?ml|[^/]+\.tf|Pulumi\.ya?ml|[^/]+\.bicep|appspec\.yml|nginx\.conf|supervisord\.conf)$/ },
  { kind: 'config', re: /(^|\/)(\.env\.(example|sample|template)|[^/]*\.env\.example|appsettings[^/]*\.json|application[^/]*\.(properties|ya?ml)|web\.config|config\/[^/]+\.(ya?ml|json|toml|rb|exs))$/ },
  { kind: 'docs', re: /(^|\/)(README[^/]*|CONTRIBUTING[^/]*|ARCHITECTURE[^/]*|CODEOWNERS|AGENTS\.md|CLAUDE\.md|docs\/[^/]+\.md)$/i },
  { kind: 'tests', re: /(^|\/)(jest\.config\.[^/]+|vitest\.config\.[^/]+|playwright\.config\.[^/]+|cypress\.config\.[^/]+|pytest\.ini|tox\.ini|phpunit\.xml[^/]*|karma\.conf\.[^/]+|\.rspec)$/ },
];

function lsFiles(dir) {
  return new Promise((resolve, reject) => {
    execFile('git', ['ls-files', '-z'], { cwd: dir, maxBuffer: 1024 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(new Error(`git ls-files failed: ${err.message}`));
      else resolve(stdout.split('\0').filter(Boolean));
    });
  });
}

const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

export async function takeInventory(projectDir, { ignore = [] } = {}) {
  const ignored = (file) => file.startsWith('.harness/') || ignore.some((prefix) => file === prefix || file.startsWith(prefix.replace(/\/?$/, '/')));
  const files = (await lsFiles(projectDir)).filter((f) => !ignored(f));

  const byLanguage = new Map();
  const byTop = new Map();
  const bySecond = new Map();
  const signals = Object.fromEntries(SIGNALS.map((s) => [s.kind, []]));
  let codeFiles = 0;

  for (const file of files) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const lang = LANGUAGES[ext];
    if (lang) {
      bump(byLanguage, lang);
      if (!NOT_CODE.has(lang)) codeFiles++;
    }
    const parts = file.split('/');
    bump(byTop, parts.length > 1 ? parts[0] + '/' : '(root files)');
    if (parts.length > 2) bump(bySecond, `${parts[0]}/${parts[1]}/`);
    for (const s of SIGNALS) if (signals[s.kind].length < 400 && s.re.test(file)) signals[s.kind].push(file);
  }

  // Line counts are sampled: reading every file of a very large repository is not worth the wait.
  const sample = files.filter((f) => LANGUAGES[path.extname(f).slice(1).toLowerCase()] && !NOT_CODE.has(LANGUAGES[path.extname(f).slice(1).toLowerCase()]));
  const step = Math.max(1, Math.floor(sample.length / 3000));
  let sampled = 0;
  let sampledLines = 0;
  for (let i = 0; i < sample.length; i += step) {
    try {
      const full = path.join(projectDir, sample[i]);
      if (fs.statSync(full).size > 5_000_000) continue;
      sampledLines += fs.readFileSync(full, 'utf8').split('\n').length;
      sampled++;
    } catch {
      // unreadable or vanished file: skip
    }
  }
  const estimatedLines = sampled ? Math.round((sampledLines / sampled) * sample.length) : 0;

  return {
    totalFiles: files.length,
    codeFiles,
    estimatedLines,
    languages: top(byLanguage, 30),
    topLevel: top(byTop, 60),
    secondLevel: top(bySecond, 120),
    signals,
  };
}

export const isExistingCodebase = (inv) => inv.codeFiles >= 10;

export function renderInventory(inv) {
  const table = (rows, head) => [`| ${head[0]} | ${head[1]} |`, '|---|---:|', ...rows.map(([k, v]) => `| \`${k}\` | ${v.toLocaleString('en-US')} |`)].join('\n');
  const list = (items) => (items.length ? items.slice(0, 150).map((f) => `- \`${f}\``).join('\n') + (items.length > 150 ? `\n- … ${items.length - 150} more` : '') : '- none found');
  return [
    '# Codebase inventory',
    '',
    'Generated by the harness from the tracked files. This is a census, not an explanation: it says what is there and how big, so the survey can be divided sensibly.',
    '',
    `- Tracked files: ${inv.totalFiles.toLocaleString('en-US')}`,
    `- Source files: ${inv.codeFiles.toLocaleString('en-US')}`,
    `- Estimated lines of source: ${inv.estimatedLines.toLocaleString('en-US')} (sampled)`,
    '',
    '## Languages (by file count)',
    table(inv.languages, ['Language', 'Files']),
    '',
    '## Top-level folders',
    table(inv.topLevel, ['Folder', 'Files']),
    '',
    '## Largest second-level folders',
    table(inv.secondLevel.slice(0, 80), ['Folder', 'Files']),
    '',
    '## Build and package manifests',
    list(inv.signals.manifest),
    '',
    '## CI/CD pipelines',
    list(inv.signals.ci),
    '',
    '## Deployment and infrastructure files',
    list(inv.signals.deploy),
    '',
    '## Configuration templates',
    list(inv.signals.config),
    '',
    '## Test configuration',
    list(inv.signals.tests),
    '',
    '## Existing documentation',
    list(inv.signals.docs),
    '',
  ].join('\n');
}
