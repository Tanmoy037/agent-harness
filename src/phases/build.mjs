import path from 'node:path';
import { c, HarnessError } from '../util.mjs';
import { info, warn } from '../ui.mjs';
import { CODE_REVIEW } from '../schemas.mjs';
import { getRole, resolveEngine } from '../team.mjs';
import { harnessDir } from '../state.mjs';
import { addWorktree, removeWorktree, mergeBranch, mergeInProgress, abortMerge, commitAll, head, git } from '../git.mjs';

/**
 * Build: senior engineers execute the task graph in parallel, each in its own git
 * worktree and branch. Every task is reviewed by the staff engineer before it is merged
 * into the run's branch, so the shared branch only ever receives reviewed work.
 */

/** Run the task graph, respecting dependencies, with at most `modes.engineers` tasks in flight. */
export async function runTasks(run, tasks, { prefix, context = [] }) {
  const { state, modes } = run;
  const merged = new Set(state.get(`${prefix}.merged`, []));
  const running = new Map();
  let failure = null;

  const ready = () => tasks.filter((t) => !merged.has(t.id) && !running.has(t.id) && (t.depends_on ?? []).every((d) => merged.has(d)));

  const start = (task) => {
    const p = runTask(run, task, { prefix, context })
      .then(() => {
        merged.add(task.id);
        state.set(`${prefix}.merged`, [...merged]);
      })
      .catch((err) => {
        failure ??= err;
      })
      .finally(() => running.delete(task.id));
    running.set(task.id, p);
  };

  while (merged.size < tasks.length) {
    if (!failure) for (const task of ready().slice(0, modes.engineers - running.size)) start(task);
    if (!running.size) {
      if (failure) throw failure;
      throw new HarnessError(`No task can start: the remaining tasks depend on tasks that are not in the plan (${tasks.filter((t) => !merged.has(t.id)).map((t) => t.id).join(', ')}).`);
    }
    await Promise.race(running.values());
  }
  if (failure) throw failure;
}

async function runTask(run, task, { prefix, context }) {
  const { state, projectDir, options } = run;
  // Only Claude roles build; a task assigned to a boss-side role goes to a senior engineer.
  let owner = task.owner && run.team.roles[task.owner] ? task.owner : 'senior-engineer';
  if (resolveEngine(run.team, getRole(run.team, owner), run.modes).kind !== 'claude' || owner === 'boss') owner = 'senior-engineer';

  const branch = `harness/${state.id}/${task.id}`;
  const worktree = path.join(harnessDir(projectDir), 'worktrees', state.id, task.id);
  await run.gitLock.run(async () => addWorktree(projectDir, worktree, branch, await head(projectDir)));

  const taskText = [
    `Task ${task.id}: ${task.title}`,
    '',
    task.description,
    '',
    `Acceptance criteria:\n${task.acceptance}`,
    task.files?.length ? `\nMain files: ${task.files.join(', ')}` : '',
  ].join('\n');

  const buildId = `${prefix}.task.${task.id}`;
  await run.work({
    id: buildId,
    role: owner,
    title: `Build: ${task.title}`,
    cwd: worktree,
    task: `${taskText}

You are working in your own git worktree on branch \`${branch}\`, created from the team's integration branch. Other engineers are building other tasks at the same time in their own worktrees; the tasks you depend on are already merged into what you see. Stay inside this task: if you find you need to change something that belongs to another task or to the shared contracts, do the minimum, and say so clearly in your handoff.

A fresh worktree has no installed dependencies: install them first. Build the task test-first, keep to the conventions in the implementation plan, and do not finish until the acceptance criteria are met and you have run the build, the linter and the tests and seen them pass. Commit your work on this branch with clear messages. Do not merge, push or switch branches.`,
    readFirst: context,
  });
  await commitAll(worktree, `[team] ${task.id}: ${task.title}`);

  // Code review before merge. The reviewer reads and runs the branch but does not edit it.
  for (let round = 1; round <= options.codeReviewRounds; round++) {
    const review = await run.decide({
      id: `${prefix}.review.${task.id}.r${round}`,
      role: 'staff-engineer',
      title: `Code review: ${task.title}${round > 1 ? ` (round ${round})` : ''}`,
      cwd: worktree,
      schema: CODE_REVIEW,
      schemaName: 'code_review',
      task: `Review this task branch before it is merged. See exactly what changed with \`git diff ${state.data.branch}...HEAD\` and \`git log ${state.data.branch}..HEAD\`.

${taskText}

Check, in this order: does it meet every acceptance criterion (run the build and the tests yourself; do not take the report's word); is it correct, including edge cases, error paths and concurrency; does it follow the architecture, the contracts and the conventions; are the tests real tests of behaviour; is there a security problem; does it match the design specification where it has UI; is anything outside the task's scope changed; is there dead code, duplication or needless complexity.

Approve when it is right. Request changes only for things that must be fixed before merge, each stated precisely with the file and what "fixed" means. ${round === options.codeReviewRounds ? 'This is the last review round: approve unless a remaining problem would break the product, and list anything smaller in the summary.' : ''} Record in "lessons" anything this review teaches about how the team should work.`,
      readFirst: context,
    });
    if (review.verdict === 'approve' || !review.required_changes?.length) break;
    run.log(c.yellow(`↺ Review sent ${task.id} back with ${review.required_changes.length} change(s)`));
    await run.work({
      id: `${prefix}.fix.${task.id}.r${round}`,
      role: owner,
      title: `Address review: ${task.title}`,
      cwd: worktree,
      resumeFrom: buildId,
      task: `The staff engineer reviewed your branch for task ${task.id} and requires changes before it can merge. Make them, re-run the build and tests, and commit.`,
      feedback: review.required_changes.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    });
    await commitAll(worktree, `[team] ${task.id}: address review`);
  }

  // Merges into the shared branch happen one at a time.
  await run.gitLock.run(async () => {
    if (await mergeInProgress(projectDir)) await abortMerge(projectDir);
    const result = await mergeBranch(projectDir, branch, `[team] merge ${task.id}: ${task.title}`);
    if (result.ok) return;
    warn(`Merge conflict on ${task.id} (${result.conflicts.length} file(s)); the staff engineer is resolving it.`);
    await run.work({
      id: `${prefix}.merge.${task.id}`,
      role: 'staff-engineer',
      title: `Resolve merge conflict: ${task.title}`,
      cwd: projectDir,
      task: `Merging branch \`${branch}\` (task ${task.id}: ${task.title}) into the integration branch produced conflicts, and the merge is in progress in this checkout. Conflicted files:\n${result.conflicts.map((f) => `- ${f}`).join('\n')}

Resolve each conflict so that both the already-merged work and this task's work are correct; read both sides and the tasks they come from rather than picking one. Stage the resolutions with \`git add\`, then run the build and the full test suite and fix whatever the combination broke. Do not abort the merge and do not commit; the harness concludes the merge when you report.`,
      readFirst: context,
    });
    const unmerged = (await git(projectDir, ['diff', '--name-only', '--diff-filter=U'])).stdout;
    if (unmerged) {
      await abortMerge(projectDir);
      throw new HarnessError(`The merge of ${task.id} still has unresolved conflicts in: ${unmerged.replace(/\n/g, ', ')}`);
    }
    await commitAll(projectDir, `[team] merge ${task.id}: ${task.title} (conflicts resolved)`);
  });
  await run.gitLock.run(() => removeWorktree(projectDir, worktree, branch));
  info(`Merged ${task.id}`);
}

export async function build(run, tasks) {
  const E = (rel) => run.doc(`engineering/${rel}`);
  const context = [E('implementation-plan.md'), E('architecture.md'), run.doc('product/PRD.md')];
  if (run.docExists('design/design-system.md')) context.push(run.doc('design/design-system.md'), run.doc('design/screens.md'), run.doc('design/tokens.css'), run.doc('design/prototype/'));

  info(`Building ${tasks.length} task(s) with up to ${run.modes.engineers} engineer(s) in parallel`);
  await runTasks(run, tasks, { prefix: 'build', context });

  await run.work({
    id: 'build.integration',
    role: 'staff-engineer',
    title: 'Integrate and verify the whole build',
    task: `Every task is merged. Now make sure the whole is sound, in the integration checkout. Install from clean, run the full build, the linter, the type checker and the entire test suite, start the product, and exercise the main flows end to end yourself. Fix what the combination of tasks broke: mismatched contracts, duplicated or diverging code, missing wiring, configuration that only worked in one worktree. Check that every task in ${E('tasks.json')} is really present and working, and that nothing in the PRD's must-haves fell between tasks. Update the README so a newcomer can install, run and test the product with the commands that actually work. Report exactly what you ran and what passed.`,
    readFirst: [...context, E('tasks.json')],
  });
  await run.commit('integration of all tasks');
}
