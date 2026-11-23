import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HARNESS_HOME, slug } from './util.mjs';

/**
 * The team's memory: how the harness gets better the more it works.
 *
 * Everything is a plain JSON-lines file so the owner can read, edit or delete what the
 * team has learned, and the harness folder's git history records every change.
 *
 *   memory/roles/<role>.jsonl   lessons for one role, across all products
 *   memory/team.jsonl           lessons about how the team works together
 *   memory/owner.jsonl          the owner's stated preferences and feedback
 *   memory/design/library.jsonl real sites the designers have studied
 *   memory/metrics.jsonl        one line per run, to see whether quality is improving
 *   <product>/.harness/memory/project.jsonl   facts and decisions about one product
 *
 * Only two things write lessons: the owner's own words at an approval point (stored
 * verbatim) and the director's end-of-run retrospective (curated from what reviews, QA and
 * security actually found). Agents propose lessons; they do not write memory directly.
 */

export const MEMORY_DIR = process.env.HARNESS_MEMORY_DIR || path.join(HARNESS_HOME, 'memory');

const RECALL_LIMIT = { role: 30, team: 15, owner: 30, project: 40 };
export const CONSOLIDATE_AT = 60;

function fileFor(scope, { role, projectDir } = {}) {
  switch (scope) {
    case 'role':
      return path.join(MEMORY_DIR, 'roles', `${role}.jsonl`);
    case 'team':
      return path.join(MEMORY_DIR, 'team.jsonl');
    case 'owner':
      return path.join(MEMORY_DIR, 'owner.jsonl');
    case 'project':
      return path.join(projectDir, '.harness', 'memory', 'project.jsonl');
    case 'design-library':
      return path.join(MEMORY_DIR, 'design', 'library.jsonl');
    case 'metrics':
      return path.join(MEMORY_DIR, 'metrics.jsonl');
    default:
      throw new Error(`Unknown memory scope: ${scope}`);
  }
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a hand-edited line that is not valid JSON is skipped rather than breaking a run
    }
  }
  return out;
}

function writeLines(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));
  fs.renameSync(tmp, file);
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

/** Word-overlap similarity, used to recognise a lesson the team has already learned. */
export function similarity(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

const clean = (s, max = 600) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Store a lesson. A lesson the team already has is not duplicated: its `hits` count goes
 * up instead, which is how repeatedly confirmed lessons rise to the top of recall.
 */
export function remember(scope, text, { role, projectDir, run, project, evidence, source = 'retrospective' } = {}) {
  const lesson = clean(text);
  if (lesson.length < 12) return null;
  const file = fileFor(scope, { role, projectDir });
  const entries = readLines(file);
  const today = new Date().toISOString().slice(0, 10);
  const match = entries.find((e) => !e.retired && similarity(e.lesson, lesson) >= 0.7);
  if (match) {
    match.hits = (match.hits ?? 1) + 1;
    match.lastSeen = today;
    writeLines(file, entries);
    return match;
  }
  const prefix = scope === 'role' ? slug(role, 12) : scope;
  const entry = {
    id: `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    lesson,
    evidence: clean(evidence, 300) || undefined,
    source,
    run,
    project,
    created: today,
    lastSeen: today,
    hits: 1,
  };
  entries.push(entry);
  writeLines(file, entries);
  return entry;
}

export function list(scope, opts = {}) {
  return readLines(fileFor(scope, opts)).filter((e) => !e.retired);
}

/** Retire lessons by id across every lesson file. Retired lessons stay on disk but are no longer recalled. */
export function retire(ids, { projectDir } = {}) {
  const wanted = new Set(ids);
  if (!wanted.size) return 0;
  const files = [fileFor('team'), fileFor('owner')];
  const rolesDir = path.join(MEMORY_DIR, 'roles');
  if (fs.existsSync(rolesDir)) for (const f of fs.readdirSync(rolesDir)) files.push(path.join(rolesDir, f));
  if (projectDir) files.push(fileFor('project', { projectDir }));
  let count = 0;
  for (const file of files) {
    const entries = readLines(file);
    let touched = false;
    for (const e of entries) {
      if (wanted.has(e.id) && !e.retired) {
        e.retired = new Date().toISOString().slice(0, 10);
        touched = true;
        count++;
      }
    }
    if (touched) writeLines(file, entries);
  }
  return count;
}

const rank = (entries) =>
  [...entries].sort((a, b) => (b.hits ?? 1) - (a.hits ?? 1) || String(b.lastSeen).localeCompare(String(a.lastSeen)));

function section(title, entries, limit) {
  const top = rank(entries).slice(0, limit);
  if (!top.length) return '';
  const lines = top.map((e) => `- ${e.lesson}${(e.hits ?? 1) > 1 ? ` (confirmed ${e.hits} times)` : ''}`);
  return `### ${title}\n${lines.join('\n')}\n`;
}

/** The memory block placed in an agent's assignment. Empty string when nothing is known yet. */
export function recall({ role, projectDir }) {
  const parts = [
    section('What the owner has told this team', list('owner'), RECALL_LIMIT.owner),
    section('About this product', projectDir ? list('project', { projectDir }) : [], RECALL_LIMIT.project),
    section(`Lessons for your role (${role})`, list('role', { role }), RECALL_LIMIT.role),
    section('Lessons for the whole team', list('team'), RECALL_LIMIT.team),
  ].filter(Boolean);
  if (!parts.length) return '';
  return [
    '## Team memory',
    'Learned from earlier work and from the owner. Apply these. If one is wrong for this situation, say so in your report rather than silently ignoring it.',
    '',
    parts.join('\n'),
  ].join('\n');
}

/** Everything the director needs to curate memory in a retrospective, including ids so lessons can be retired. */
export function dumpForCuration({ roles, projectDir }) {
  const fmt = (entries) => rank(entries).map((e) => `- [${e.id}] (hits ${e.hits ?? 1}) ${e.lesson}`).join('\n') || '- none yet';
  const out = [`### owner\n${fmt(list('owner'))}`, `### team\n${fmt(list('team'))}`];
  if (projectDir) out.push(`### project\n${fmt(list('project', { projectDir }))}`);
  for (const role of roles) {
    const entries = list('role', { role });
    if (entries.length) out.push(`### role: ${role}${entries.length >= CONSOLIDATE_AT ? ' (too long: consolidate)' : ''}\n${fmt(entries)}`);
  }
  return out.join('\n\n');
}

export function recordMetrics(entry) {
  const file = fileFor('metrics');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ...entry, recorded: new Date().toISOString() }) + '\n');
}

export const readMetrics = () => readLines(fileFor('metrics'));

/** Reference sites the designers have studied, most recent first. */
export function designLibrary({ limit = 40 } = {}) {
  return readLines(fileFor('design-library')).slice(-limit).reverse();
}

export function addToDesignLibrary(entry) {
  const file = fileFor('design-library');
  const entries = readLines(file);
  const existing = entries.find((e) => e.url === entry.url);
  if (existing) Object.assign(existing, entry, { studied: (existing.studied ?? 1) + 1 });
  else entries.push({ ...entry, studied: 1 });
  writeLines(file, entries);
}

/** Record what was learned in the harness folder's git history, when it is a git repo. */
export function commitMemory(message) {
  try {
    const run = (args) => execFileSync('git', args, { cwd: HARNESS_HOME, stdio: 'pipe' });
    run(['rev-parse', '--git-dir']);
    // Only paths that exist: git refuses the whole add when one pathspec matches nothing.
    const paths = ['memory', 'skills/learned', 'team/learned.json'].filter((p) => fs.existsSync(path.join(HARNESS_HOME, p)));
    if (!paths.length) return false;
    run(['add', '-A', ...paths]);
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: HARNESS_HOME, encoding: 'utf8' }).trim();
    if (!staged) return false;
    run(['-c', 'user.name=Harness', '-c', 'user.email=harness@localhost', 'commit', '-q', '-m', message]);
    return true;
  } catch {
    return false; // not a git repo, or nothing to record: memory files are still saved
  }
}
