import fs from 'node:fs';
import path from 'node:path';
import { c, formatDuration, HarnessError, truncate } from './util.mjs';
import { banner, info, ok, warn, fail } from './ui.mjs';
import { hasUI, describeModes, normalizeModes } from './modes.mjs';
import { Run, PauseRun } from './run.mjs';
import { RunState, harnessDir, saveProjectConfig, loadProjectConfig } from './state.mjs';
import { buildTeam, loadTeam } from './team.mjs';
import { killAll } from './runners/proc.mjs';
import * as git from './git.mjs';
import * as memory from './memory.mjs';
import { takeInventory, isExistingCodebase } from './inventory.mjs';
import { survey } from './phases/survey.mjs';
import { intake, discovery } from './phases/discovery.mjs';
import { design } from './phases/design.mjs';
import { architecture, loadTasks } from './phases/architecture.mjs';
import { build } from './phases/build.mjs';
import { verify } from './phases/verify.mjs';
import { launch, release } from './phases/release.mjs';
import { retrospective, runMetrics } from './phases/retro.mjs';

export const PHASES = [
  { id: 'survey', title: 'Understand the existing product', run: survey },
  { id: 'intake', title: 'Interview the owner', run: intake },
  { id: 'discovery', title: 'Research and requirements', run: discovery },
  { id: 'design', title: 'Design', run: design, when: (run) => hasUI(run.modes) },
  { id: 'architecture', title: 'Architecture and plan', run: architecture },
  {
    id: 'build',
    title: 'Build',
    run: async (run) => {
      const file = run.doc('engineering/tasks.json');
      const { tasks, problems } = loadTasks(run, file);
      if (problems.length) throw new HarnessError(`Cannot build: ${file}: ${problems.join('; ')}`);
      await build(run, tasks);
    },
  },
  { id: 'verify', title: 'Verify the whole product', run: verify },
  { id: 'launch', title: 'Launch material', run: launch, when: (run) => run.modes.business },
  { id: 'release', title: 'Release', run: release },
  { id: 'retro', title: 'Retrospective', run: retrospective },
];

export const PHASE_IDS = PHASES.map((p) => p.id);

/** Is there a real codebase here already? Decided before the harness adds anything. */
export async function detectExisting(projectDir) {
  if (!fs.existsSync(projectDir) || !(await git.isRepo(projectDir))) {
    if (!fs.existsSync(projectDir)) return false;
    // Not a repository: look for source files directly, ignoring dependency folders.
    const stack = [projectDir];
    let seen = 0;
    let code = 0;
    while (stack.length && seen < 5000) {
      const dir = stack.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'vendor', 'target'].includes(e.name)) continue;
        if (e.isDirectory()) stack.push(path.join(dir, e.name));
        else if (++seen && /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|cs|cpp|c|php|swift|scala)$/.test(e.name)) code++;
      }
    }
    return code >= 10;
  }
  const docsDir = loadProjectConfig(projectDir).docsDir;
  return isExistingCodebase(await takeInventory(projectDir, { ignore: docsDir && docsDir !== 'docs' ? [docsDir] : [] }));
}

/**
 * Put the product folder under git and onto a branch of its own for this run, so the
 * team's work never lands on the owner's branch and can be reviewed or discarded whole.
 */
async function prepareRepository(projectDir, state, ui) {
  fs.mkdirSync(projectDir, { recursive: true });
  if (state.data.branch) {
    const current = await git.currentBranch(projectDir);
    if (current !== state.data.branch) {
      throw new HarnessError(`This run works on branch "${state.data.branch}" but the folder is on "${current}". Check out the run's branch and resume.`);
    }
    if (await git.mergeInProgress(projectDir)) await git.abortMerge(projectDir); // left over from an interrupted run
    return;
  }

  if (!(await git.isRepo(projectDir))) {
    await git.initRepo(projectDir);
    info('Initialised a git repository in the product folder.');
  } else if (fs.realpathSync(await git.repoRoot(projectDir)) !== fs.realpathSync(projectDir)) {
    // Compared as real paths: the folder may be reached through a symlink (/tmp on macOS, for one).
    throw new HarnessError(`Run the harness from the repository root (${await git.repoRoot(projectDir)}), not a subfolder.`);
  }
  await git.excludeLocally(projectDir, ['.harness/']);

  if (!(await git.hasCommits(projectDir))) {
    if (!(await git.commitAll(projectDir, '[team] baseline'))) {
      fs.writeFileSync(path.join(projectDir, '.gitkeep'), '');
      await git.commitAll(projectDir, '[team] start');
    }
    state.setStatus('running', { baseBranch: await git.currentBranch(projectDir), branch: await git.currentBranch(projectDir) });
    return;
  }

  if (!(await git.isClean(projectDir))) {
    const msg = 'The product folder has uncommitted changes. The team works on a new branch that starts from your last commit plus these changes.';
    if (!ui.interactive) throw new HarnessError(`${msg} Commit or stash them first.`);
    if (!(await ui.confirm(`${msg} Include them in the baseline commit on the new branch?`, { fallback: false }))) {
      throw new HarnessError('Commit or stash your changes, then start again.');
    }
  }
  const baseBranch = await git.currentBranch(projectDir);
  const branch = `harness/${state.id}`;
  await git.createBranch(projectDir, branch);
  await git.commitAll(projectDir, '[team] baseline: uncommitted changes at the start of the run');
  state.setStatus('running', { baseBranch, branch });
  info(`Working on branch ${c.cyan(branch)} (from ${baseBranch}). Your branch is not touched.`);
}

function selectPhases({ from, until, only }) {
  for (const id of [from, until, ...(only ?? [])].filter(Boolean)) {
    if (!PHASE_IDS.includes(id)) throw new HarnessError(`Unknown phase "${id}". Phases: ${PHASE_IDS.join(', ')}`);
  }
  if (only?.length) return PHASES.filter((p) => only.includes(p.id));
  const start = from ? PHASE_IDS.indexOf(from) : 0;
  const end = until ? PHASE_IDS.indexOf(until) : PHASES.length - 1;
  if (start > end) throw new HarnessError(`--from ${from} comes after --until ${until}.`);
  return PHASES.slice(start, end + 1);
}

/** Create a new run. Does not start it. */
export async function createRun(projectDir, { request, modes }) {
  const saved = loadProjectConfig(projectDir);
  // An existing product keeps its own docs folder; the team's documents go beside them.
  const docsDir = saved.docsDir ?? (fs.existsSync(path.join(projectDir, 'docs')) && fs.readdirSync(path.join(projectDir, 'docs')).length ? 'docs/team' : 'docs');
  const existing = await detectExisting(projectDir);
  fs.mkdirSync(harnessDir(projectDir), { recursive: true });
  saveProjectConfig(projectDir, { ...saved, modes, docsDir });
  const state = RunState.create(projectDir, { request, modes, docsDir });
  state.setStatus('running', { existing });
  return state;
}

/** Execute (or continue) a run. Returns the final status. */
export async function executeRun(projectDir, state, { ui, options = {}, from, until, only } = {}) {
  const built = buildTeam();
  for (const p of built.problems) warn(p);
  const team = loadTeam();
  const modes = (state.data.modes = normalizeModes(state.data.modes));
  const run = new Run({ projectDir, state, team, modes, ui, options });
  const phases = selectPhases({ from, until, only });

  let interrupted = false;
  const onSignal = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log(c.yellow('\nStopping the agents… (press Ctrl-C again to force quit)'));
    killAll();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const started = Date.now();
  try {
    await prepareRepository(projectDir, state, ui);
    banner(`Run ${state.id}`);
    console.log(describeModes(modes));
    console.log(`Product folder: ${projectDir}\nTeam documents: ${path.join(projectDir, state.data.docsDir)}\n`);
    state.setStatus('running', { error: undefined, pausedReason: undefined });

    for (const phase of phases) {
      if (phase.when && !phase.when(run)) continue;
      if (state.data.phasesDone?.includes(phase.id) && phase.id !== 'retro') continue;
      banner(phase.title);
      state.setStatus('running', { phase: phase.id });
      await phase.run(run);
      state.setStatus('running', { phasesDone: [...new Set([...(state.data.phasesDone ?? []), phase.id])] });
      if (interrupted) throw new PauseRun('Interrupted.');
    }

    const complete = phases.at(-1).id === PHASE_IDS.at(-1);
    state.setStatus(complete ? 'done' : 'paused', complete ? {} : { pausedReason: `Stopped after phase "${phases.at(-1).id}" as requested.` });
    printSummary(run, Date.now() - started);
    return state.data.status;
  } catch (err) {
    if (interrupted || err instanceof PauseRun) {
      state.setStatus('paused', { pausedReason: interrupted ? 'Interrupted by the owner.' : err.message });
      console.log(`\n${c.yellow('⏸  Paused.')} ${interrupted ? 'Interrupted.' : err.message}`);
      console.log(c.dim(`Nothing is lost. Continue with: harness resume${projectDir === process.cwd() ? '' : ` --project ${projectDir}`}`));
      return 'paused';
    }
    state.setStatus('failed', { error: err.message });
    memory.recordMetrics(runMetrics(run, { failedAt: state.data.phase }));
    fail(err instanceof HarnessError ? err.message : (err.stack ?? String(err)));
    console.log(c.dim('Finished steps are saved. After fixing the cause, continue with: harness resume'));
    return 'failed';
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

function printSummary(run, elapsedMs) {
  const { state } = run;
  const totals = state.totals();
  banner(state.data.status === 'done' ? 'Run complete' : 'Run stopped');
  console.log(`Steps: ${totals.done} completed · agent time ${formatDuration(totals.durationMs)} · wall time ${formatDuration(elapsedMs)}${totals.costUsd ? ` · Claude usage ≈ $${totals.costUsd.toFixed(2)} at list price` : ''}`);
  console.log(`Branch: ${c.cyan(state.data.branch)}${state.data.baseBranch && state.data.baseBranch !== state.data.branch ? ` (from ${state.data.baseBranch}; merge it when you are satisfied)` : ''}`);
  console.log(`Documents: ${path.join(run.projectDir, state.data.docsDir)}`);
  const deferred = state.get('verify.deferred', []);
  if (deferred.length) {
    console.log(`\n${c.bold('Deferred by the director:')}`);
    for (const d of deferred.slice(0, 10)) console.log(`  - ${truncate(d, 160)}`);
  }
  if (state.data.status === 'done') {
    if (state.get('release.deployed') === false) {
      warn(`Not deployed: see ${run.doc('platform/runbook.md')} for what you need to provide.`);
    } else if (state.get('release.deployed')) {
      ok(`Deployed: see ${run.doc('platform/deployments.md')}.`);
    }
  }
}
