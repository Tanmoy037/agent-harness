import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HARNESS_HOME, c, parseArgs, readJson, truncate, formatDuration, HarnessError } from './util.mjs';
import { UI, banner, info, ok, warn, fail } from './ui.mjs';
import { chooseModes, modesFromFlags, validateModes, normalizeModes, describeModes, DEFAULT_MODES, APPROVALS, ACCESS, PRODUCT_TYPES, DIRECTOR_ENGINES, SURVEY } from './modes.mjs';
import { RunState, latestRun, listRuns, loadProjectConfig } from './state.mjs';
import { createRun, executeRun, detectExisting, PHASES, PHASE_IDS } from './pipeline.mjs';
import { Run } from './run.mjs';
import { buildTeam, loadTeam, allSkills, skillDescription, BUILD_DIR } from './team.mjs';
import { installSkills, auditSkills, loadSources } from './skills.mjs';
import { retrospective } from './phases/retro.mjs';
import * as memory from './memory.mjs';

const HELP = `${c.bold('harness')} — a software company of AI agents

${c.bold('Build something')}
  harness run "<what you want built>"     Start a run in the current folder (new or existing product)
  harness resume [run-id]                 Continue a paused, interrupted or failed run
  harness status                          Show the latest run: phase, steps, time, cost
  harness survey                          Only map an existing codebase into the team's knowledge base
  harness ask <role> "<task>"             Give one task to one team member

${c.bold('The team')}
  harness team                            List roles, engines and skills
  harness team build                      Rebuild every role's folder from team/roles.json
  harness skills install [name...]        Vendor third-party skills at their pinned commits
  harness skills audit                    Scan all skills for patterns that deserve a human look
  harness skills list                     Every installed skill and which roles carry it
  harness memory [scope]                  Show what the team has learned (owner, team, project, or a role id)
  harness memory forget <id>              Retire a lesson
  harness stats                           Quality trend across runs
  harness retro [run-id]                  Run the retrospective for a run that did not reach it
  harness doctor                          Check the CLIs, logins and tools the team needs

${c.bold('Modes')} (asked interactively unless given)
  --director <${Object.keys(DIRECTOR_ENGINES).join("|")}>               Who is the director: Codex, or Claude Fable when Codex is unavailable
  --approvals <${Object.keys(APPROVALS).join('|')}>
  --access <${Object.keys(ACCESS).join('|')}>
  --type <${Object.keys(PRODUCT_TYPES).join(',')}>   (comma separated)
  --survey <${Object.keys(SURVEY).join('|')}>            Map an existing codebase first
  --engineers <1-8>                       Engineers working in parallel
  --business <true|false>                 Include market research, marketing and sales
  --defaults                              Do not ask; use saved or default modes

${c.bold('Run control')}
  --project <dir>                         Product folder (default: current folder)
  --from <phase> --until <phase>          Run part of the pipeline: ${PHASE_IDS.join(', ')}
  --quiet                                 Hide the live activity lines
  --no-interactive                        Never prompt; pause at approval points instead
`;

const options = () => readJson(path.join(HARNESS_HOME, 'harness.config.json'), {}).options ?? {};

function projectDirOf(flags) {
  return path.resolve(flags.project ? String(flags.project) : process.cwd());
}

function guardProjectDir(projectDir) {
  const rel = path.relative(HARNESS_HOME, projectDir);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new HarnessError('That is the harness itself. Run from your product\'s folder, or pass --project <dir>.');
  }
}

function binaryWorks(bin, args = ['--version']) {
  try {
    return execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 20_000 }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

function makeUI(flags) {
  return new UI({ interactive: flags.interactive !== false && flags.noInteractive !== true });
}

async function resolveModes(ui, projectDir, flags) {
  const saved = normalizeModes(loadProjectConfig(projectDir).modes ?? {});
  const fromFlags = modesFromFlags(flags);
  const codexAvailable = Boolean(binaryWorks('codex'));
  const existingCode = await detectExisting(projectDir);
  let modes;
  if (flags.defaults || !ui.interactive) {
    modes = validateModes({ ...DEFAULT_MODES, ...(codexAvailable ? {} : { directorEngine: 'claude' }), ...saved, ...fromFlags });
  } else {
    banner('How should the team work?');
    modes = await chooseModes(ui, { saved, flags: fromFlags, codexAvailable, existingCode });
  }
  if (modes.directorEngine === 'codex' && !codexAvailable) {
    warn('The Codex CLI is not available on this machine, so Claude Fable will act as the director.');
    modes.directorEngine = 'claude';
  }
  return modes;
}

// ---------------------------------------------------------------- commands

async function cmdRun(flags) {
  const projectDir = projectDirOf(flags);
  guardProjectDir(projectDir);
  const ui = makeUI(flags);
  let request = flags._.join(' ').trim();
  if (flags.requestFile) request = fs.readFileSync(path.resolve(String(flags.requestFile)), 'utf8').trim();
  if (!request && ui.interactive) request = await ui.text('What should the team build?', { hint: 'Describe it in your own words. The director will ask follow-up questions.' });
  if (!request) throw new HarnessError('Say what to build: harness run "<what you want built>"');

  const unfinished = listRuns(projectDir).filter((r) => r.status === 'paused' || r.status === 'running');
  if (unfinished.length && ui.interactive) {
    const last = unfinished.at(-1);
    warn(`This product has an unfinished run (${last.id}, ${last.status} in phase "${last.phase}").`);
    if (!(await ui.confirm('Start a new run anyway? (No = stop here; use "harness resume" to continue the old one)', { fallback: false }))) return 0;
  }

  const modes = await resolveModes(ui, projectDir, flags);
  const state = await createRun(projectDir, { request, modes });
  const status = await executeRun(projectDir, state, { ui, options: { ...options(), quiet: Boolean(flags.quiet) }, from: flags.from, until: flags.until });
  return status === 'failed' ? 1 : 0;
}

async function cmdResume(flags) {
  const projectDir = projectDirOf(flags);
  const data = flags._[0] ? RunState.load(projectDir, flags._[0]).data : latestRun(projectDir);
  if (!data) throw new HarnessError(`No runs in ${projectDir}. Start one with: harness run "<what you want built>"`);
  if (data.status === 'done' && !flags.from) {
    info(`Run ${data.id} is already complete.`);
    return 0;
  }
  const state = RunState.load(projectDir, data.id);
  const fromFlags = modesFromFlags(flags);
  if (Object.keys(fromFlags).length) {
    state.data.modes = validateModes({ ...state.data.modes, ...fromFlags });
    state.save();
    info(`Modes changed for this run:\n${describeModes(state.data.modes)}`);
  }
  const status = await executeRun(projectDir, state, {
    ui: makeUI(flags),
    options: { ...options(), quiet: Boolean(flags.quiet) },
    from: flags.from,
    until: flags.until,
    only: state.data.only,
  });
  return status === 'failed' ? 1 : 0;
}

async function cmdSurvey(flags) {
  const projectDir = projectDirOf(flags);
  guardProjectDir(projectDir);
  const ui = makeUI(flags);
  const request = flags._.join(' ').trim() || 'Understand this existing product thoroughly: what it is, how it is built, tested, configured and deployed. No change is requested yet.';
  const saved = normalizeModes(loadProjectConfig(projectDir).modes ?? {});
  const codexAvailable = Boolean(binaryWorks('codex'));
  const modes = validateModes({
    ...DEFAULT_MODES,
    ...(codexAvailable ? {} : { directorEngine: 'claude' }),
    ...saved,
    ...modesFromFlags(flags),
    survey: flags.survey ? String(flags.survey) : 'always',
  });
  const state = await createRun(projectDir, { request, modes });
  state.setStatus('running', { existing: true, only: ['survey'] });
  const status = await executeRun(projectDir, state, { ui, options: { ...options(), quiet: Boolean(flags.quiet) }, only: ['survey'] });
  return status === 'failed' ? 1 : 0;
}

function cmdStatus(flags) {
  const projectDir = projectDirOf(flags);
  const runs = listRuns(projectDir);
  if (!runs.length) {
    info(`No runs in ${projectDir}.`);
    return 0;
  }
  const data = flags._[0] ? runs.find((r) => r.id === flags._[0]) : runs.at(-1);
  if (!data) throw new HarnessError(`No run "${flags._[0]}".`);
  const state = new RunState(projectDir, data);
  const totals = state.totals();
  const colour = { done: c.green, running: c.cyan, paused: c.yellow, failed: c.red }[data.status] ?? ((s) => s);
  banner(`Run ${data.id}`);
  console.log(`Status: ${colour(data.status)}${data.phase ? ` · phase: ${data.phase}` : ''}`);
  if (data.pausedReason) console.log(`Paused: ${data.pausedReason}`);
  if (data.error) console.log(`Error: ${data.error}`);
  console.log(`Request: ${truncate(data.request, 200)}`);
  console.log(`Branch: ${data.branch ?? '(not started)'}`);
  console.log(`Steps: ${totals.done}/${totals.steps} done${totals.failed ? `, ${totals.failed} failed` : ''} · agent time ${formatDuration(totals.durationMs)}${totals.costUsd ? ` · ≈ $${totals.costUsd.toFixed(2)}` : ''}`);
  console.log(`\n${describeModes(data.modes)}\n`);
  const mark = { done: c.green('✓'), running: c.cyan('▶'), failed: c.red('✗'), paused: c.yellow('⏸') };
  for (const [id, s] of Object.entries(data.steps)) {
    console.log(`${mark[s.status] ?? '·'} ${id.padEnd(44)} ${c.dim((s.role ?? '').padEnd(20))} ${s.durationMs ? c.dim(formatDuration(s.durationMs)) : ''}`);
  }
  if (runs.length > 1) console.log(c.dim(`\n${runs.length} runs in this product. Pass a run id to see another.`));
  return 0;
}

async function cmdAsk(flags) {
  const [roleId, ...rest] = flags._;
  const team = loadTeam();
  if (!roleId || !team.roles[roleId]) throw new HarnessError(`Usage: harness ask <role> "<task>"\nRoles: ${Object.keys(team.roles).join(', ')}`);
  const task = rest.join(' ').trim();
  if (!task) throw new HarnessError('Say what the role should do.');
  const projectDir = projectDirOf(flags);
  guardProjectDir(projectDir);
  const ui = makeUI(flags);
  for (const p of buildTeam().problems) warn(p);
  const saved = loadProjectConfig(projectDir);
  const codexAvailable = Boolean(binaryWorks('codex'));
  const modes = validateModes({ ...DEFAULT_MODES, ...(codexAvailable ? {} : { directorEngine: 'claude' }), ...normalizeModes(saved.modes ?? {}), ...modesFromFlags(flags) });
  fs.mkdirSync(path.join(projectDir, '.harness'), { recursive: true });
  const state = RunState.create(projectDir, { request: task, modes, docsDir: saved.docsDir ?? 'docs' });
  state.setStatus('running', { only: ['ask'], phase: 'ask' });
  const run = new Run({ projectDir, state, team, modes, ui, options: { ...options(), quiet: Boolean(flags.quiet) } });
  try {
    const report = await run.work({ id: 'ask.task', role: roleId, title: truncate(task, 70), task });
    state.setStatus('done');
    console.log(`\n${c.bold('Summary')}\n${report.summary}`);
    if (report.verification) console.log(`\n${c.bold('Verified')}\n${report.verification}`);
    if (report.outputs?.length) console.log(`\n${c.bold('Files')}\n${report.outputs.map((o) => `  ${o}`).join('\n')}`);
    for (const f of report.findings ?? []) console.log(`\n${c.yellow(`[${f.severity}]`)} ${f.title}\n  ${f.details}`);
    if (report.handoff) console.log(`\n${c.bold('Next')}\n${report.handoff}`);
    return 0;
  } catch (err) {
    state.setStatus('failed', { error: err.message });
    throw err;
  }
}

function cmdTeam(flags) {
  if (flags._[0] === 'build') {
    const { roles, problems } = buildTeam();
    for (const p of problems) warn(p);
    ok(`Built ${Object.keys(roles).length} role folders in ${BUILD_DIR}`);
    return problems.length ? 1 : 0;
  }
  const team = loadTeam();
  banner('The team');
  for (const role of Object.values(team.roles)) {
    const engine = role.engine === 'claude' ? `Claude ${team.engines.claude.model}` : `director engine (Codex${team.engines.codex.model ? ` ${team.engines.codex.model}` : ''}, or Claude ${team.engines.claudeDirector.model})`;
    console.log(`\n${c.bold(role.title)} ${c.dim(`(${role.id})`)} — ${engine}, high effort`);
    console.log(c.dim(`  ${role.summary ?? ''}`));
    console.log(`  ${role.skills.length} skills: ${c.dim(role.skills.join(', '))}`);
  }
  return 0;
}

function cmdSkills(flags) {
  const [sub, ...names] = flags._;
  if (sub === 'install') {
    const { installed, failed } = installSkills({ names: names.length ? names : undefined, force: Boolean(flags.force), log: (m) => console.log(c.dim(`  ${m}`)) });
    ok(`${installed.length} skill(s) in place (${installed.filter((s) => !s.cached).length} newly vendored)`);
    for (const f of failed) fail(`${f.name}: ${f.error}`);
    for (const p of buildTeam().problems) warn(p);
    return failed.length ? 1 : 0;
  }
  if (sub === 'audit') {
    const findings = auditSkills();
    if (!findings.length) {
      ok('No suspicious patterns found in any installed skill.');
      return 0;
    }
    const bySkill = new Map();
    for (const f of findings) bySkill.set(f.skill, [...(bySkill.get(f.skill) ?? []), f]);
    for (const [skill, items] of bySkill) {
      console.log(`\n${c.bold(skill)} ${c.dim(`(${items[0].root})`)}`);
      for (const f of items.slice(0, 12)) console.log(`  ${c.yellow(f.rule.padEnd(20))} ${f.file}:${f.line}  ${c.dim(truncate(f.text, 90))}`);
      if (items.length > 12) console.log(c.dim(`  … ${items.length - 12} more`));
    }
    warn(`${findings.length} line(s) in ${bySkill.size} skill(s) deserve a look. Many are legitimate (a deploy skill mentions tokens); read them before trusting the skill.`);
    return 0;
  }
  const team = loadTeam();
  const carriers = new Map();
  for (const role of Object.values(team.roles)) for (const s of role.skills) carriers.set(s, [...(carriers.get(s) ?? []), role.id]);
  const skills = allSkills();
  for (const root of ['custom', 'learned', 'vendor']) {
    const group = skills.filter((s) => s.root === root);
    if (!group.length) continue;
    console.log(`\n${c.bold({ custom: 'Written for this team', learned: 'Learned by the team', vendor: 'Vendored from open source' }[root])} (${group.length})`);
    for (const s of group) {
      console.log(`  ${c.cyan(s.name.padEnd(38))} ${c.dim((carriers.get(s.name) ?? ['unassigned']).join(', '))}`);
      if (flags.verbose) console.log(c.dim(`      ${truncate(skillDescription(s.dir), 150)}`));
    }
  }
  const missing = loadSources().filter((s) => !skills.some((k) => k.name === s.name));
  if (missing.length) warn(`${missing.length} skill(s) in skills/sources.json are not installed. Run: harness skills install`);
  return 0;
}

function cmdMemory(flags) {
  const [first, second] = flags._;
  const projectDir = projectDirOf(flags);
  if (first === 'forget') {
    if (!second) throw new HarnessError('Usage: harness memory forget <id>');
    const n = memory.retire(flags._.slice(1), { projectDir });
    memory.commitMemory(`forget: ${flags._.slice(1).join(', ')}`);
    (n ? ok : warn)(`${n} lesson(s) retired.`);
    return 0;
  }
  const team = loadTeam();
  const scopes = first
    ? [first]
    : ['owner', 'team', 'project', ...Object.keys(team.roles)];
  let shown = 0;
  for (const scope of scopes) {
    const isRole = Boolean(team.roles[scope]);
    if (!isRole && !['owner', 'team', 'project'].includes(scope)) throw new HarnessError(`Unknown memory scope "${scope}". Use owner, team, project or a role id.`);
    const entries = isRole ? memory.list('role', { role: scope }) : memory.list(scope, { projectDir });
    if (!entries.length) continue;
    shown += entries.length;
    console.log(`\n${c.bold(isRole ? team.roles[scope].title : { owner: 'The owner', team: 'The whole team', project: `This product (${path.basename(projectDir)})` }[scope])}`);
    for (const e of entries.sort((a, b) => (b.hits ?? 1) - (a.hits ?? 1))) {
      console.log(`  ${c.dim(`[${e.id}]`)} ${e.lesson}${(e.hits ?? 1) > 1 ? c.green(` ×${e.hits}`) : ''}`);
    }
  }
  if (!shown) info('The team has not learned anything yet. Memory fills in after the first run\'s retrospective and whenever you give feedback at an approval point.');
  else console.log(c.dim(`\nStored in ${memory.MEMORY_DIR}. Retire a lesson with: harness memory forget <id>`));
  return 0;
}

function cmdStats() {
  const rows = memory.readMetrics();
  if (!rows.length) {
    info('No runs recorded yet.');
    return 0;
  }
  banner('Quality across runs');
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  console.log(c.dim('run'.padEnd(38) + 'status   phase-ok  code-ok  verify  block/major  owner-rev  learned'));
  for (const r of rows.slice(-25)) {
    console.log(
      `${truncate(r.run, 36).padEnd(38)}${String(r.status).padEnd(9)}${pct(r.phaseReviewsApprovedFirstTime, r.phaseReviews).padEnd(10)}${pct(r.codeReviewsApprovedFirstTime, r.codeReviews).padEnd(9)}${String(r.verifyRounds ?? 0).padEnd(8)}${`${r.blockers ?? 0}/${r.majors ?? 0}`.padEnd(13)}${String(r.ownerRevisions ?? 0).padEnd(11)}${r.lessonsLearned ?? ''}`,
    );
  }
  console.log(c.dim('\nphase-ok / code-ok: share approved by the director / staff engineer on first review. Rising first-pass approval and falling verify rounds, blockers and owner revisions mean the team is improving.'));
  return 0;
}

async function cmdRetro(flags) {
  const projectDir = projectDirOf(flags);
  const data = flags._[0] ? RunState.load(projectDir, flags._[0]).data : latestRun(projectDir);
  if (!data) throw new HarnessError('No run to learn from.');
  const state = RunState.load(projectDir, data.id);
  if (state.step('retro.learn')?.status === 'done') {
    info('This run already had its retrospective.');
    return 0;
  }
  for (const p of buildTeam().problems) warn(p);
  const run = new Run({ projectDir, state, team: loadTeam(), modes: state.data.modes, ui: makeUI(flags), options: { ...options(), quiet: Boolean(flags.quiet) } });
  await retrospective(run);
  return 0;
}

function cmdDoctor() {
  banner('Checking the team\'s environment');
  let problems = 0;
  const check = (label, value, help) => {
    if (value) ok(`${label}: ${value}`);
    else {
      problems++;
      fail(`${label}: not found${help ? ` — ${help}` : ''}`);
    }
  };
  check('Node', process.versions.node && Number(process.versions.node.split('.')[0]) >= 20 ? process.versions.node : null, 'Node 20 or newer is required');
  check('git', binaryWorks('git'));
  check('Claude Code CLI', binaryWorks('claude'), 'install Claude Code and run "claude" once to log in');
  const codex = binaryWorks('codex');
  if (codex) ok(`Codex CLI: ${codex}`);
  else warn('Codex CLI: not found — runs will use Claude Fable as the director (--director claude)');

  const tools = path.join(HARNESS_HOME, 'tools', 'node_modules', 'playwright');
  if (fs.existsSync(tools)) ok('Site study tool: Playwright installed');
  else {
    problems++;
    fail(`Site study tool: Playwright is not installed — run: (cd ${path.join(HARNESS_HOME, 'tools')} && npm install && npx playwright install chromium)`);
  }
  for (const [bin, why] of [['gh', 'GitHub CLI: pull requests and CI checks'], ['semgrep', 'static analysis for the security engineer'], ['docker', 'container builds for the platform engineer']]) {
    if (binaryWorks(bin)) ok(`${bin}: available`);
    else info(`${bin}: not installed (optional — ${why})`);
  }

  const { roles, problems: teamProblems } = buildTeam();
  for (const p of teamProblems) {
    problems++;
    fail(p);
  }
  const skillCount = allSkills().length;
  ok(`Team: ${Object.keys(roles).length} roles, ${skillCount} skills installed`);
  const missing = loadSources().filter((s) => !allSkills().some((k) => k.name === s.name));
  if (missing.length) {
    problems++;
    fail(`${missing.length} vendored skill(s) missing — run: harness skills install`);
  }
  console.log(problems ? c.red(`\n${problems} problem(s) to fix.`) : c.green('\nReady.'));
  return problems ? 1 : 0;
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const flags = parseArgs(rest, { booleans: ['quiet', 'defaults', 'force', 'verbose', 'noInteractive', 'help'] });
  if (!command || command === 'help' || command === '--help' || command === '-h' || flags.help) {
    console.log(HELP);
    return 0;
  }
  try {
    switch (command) {
      case 'run':
      case 'start':
        return await cmdRun(flags);
      case 'resume':
        return await cmdResume(flags);
      case 'survey':
        return await cmdSurvey(flags);
      case 'status':
        return cmdStatus(flags);
      case 'ask':
        return await cmdAsk(flags);
      case 'team':
        return cmdTeam(flags);
      case 'skills':
        return cmdSkills(flags);
      case 'memory':
        return cmdMemory(flags);
      case 'stats':
        return cmdStats();
      case 'retro':
        return await cmdRetro(flags);
      case 'doctor':
        return cmdDoctor();
      case 'phases':
        for (const p of PHASES) console.log(`${p.id.padEnd(14)} ${p.title}`);
        return 0;
      default:
        fail(`Unknown command "${command}".`);
        console.log(HELP);
        return 1;
    }
  } catch (err) {
    if (err instanceof HarnessError) {
      fail(err.message);
      return 1;
    }
    throw err;
  }
}
