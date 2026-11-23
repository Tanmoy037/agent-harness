import path from 'node:path';
import { c, truncate, formatDuration } from '../util.mjs';
import { banner, info, ok } from '../ui.mjs';
import { RETROSPECTIVE } from '../schemas.mjs';
import { writeLearnedSkill } from '../skills.mjs';
import { attachLearnedSkill, buildTeam } from '../team.mjs';
import * as memory from '../memory.mjs';

/**
 * Retrospective: where the team learns.
 *
 * The harness gives the director the factual record of the run: what was sent back in review
 * and why, what QA, security and design QA found, what the owner said, which steps failed,
 * and the lessons each agent proposed. The director distils that into durable lessons per
 * role, team-wide lessons, owner preferences and product facts, retires lessons that
 * turned out wrong or redundant, and may propose a new skill for a procedure worth
 * keeping. The next run starts with all of it.
 */

function runRecord(run) {
  const { state } = run;
  const steps = Object.entries(state.data.steps);
  const lines = [];

  const perRole = new Map();
  for (const [, s] of steps) {
    const r = perRole.get(s.role) ?? { steps: 0, ms: 0, findingsAgainst: 0 };
    r.steps++;
    r.ms += s.durationMs ?? 0;
    perRole.set(s.role, r);
  }

  lines.push('### Reviews that sent work back');
  const sentBack = steps.filter(([id, s]) => /\.review/.test(id) && s.report && (s.report.verdict === 'revise' || s.report.verdict === 'changes'));
  if (!sentBack.length) lines.push('- none');
  for (const [id, s] of sentBack) {
    const items = s.report.revisions?.map((r) => `${r.role}: ${r.instructions}`) ?? s.report.required_changes ?? [];
    lines.push(`- ${id} — ${truncate(s.report.summary, 200)}`);
    for (const item of items.slice(0, 8)) lines.push(`  - ${truncate(item, 300)}`);
  }

  lines.push('', '### Findings from verification, by who should have prevented them');
  const findings = steps.filter(([id]) => /^(verify|release)\./.test(id)).flatMap(([id, s]) => (s.report?.findings ?? []).map((f) => ({ id, from: s.role, ...f })));
  if (!findings.length) lines.push('- none');
  for (const f of findings.filter((x) => x.severity !== 'note').slice(0, 60)) {
    lines.push(`- [${f.severity}] found by ${f.from}, owner ${f.owner}: ${truncate(f.title, 120)} — ${truncate(f.details, 220)}`);
    const r = perRole.get(f.owner);
    if (r) r.findingsAgainst++;
  }

  lines.push('', '### What the owner said at approval points');
  const gateEvents = state.data.events.filter((e) => e.type === 'gate' && e.feedback);
  const choice = state.get('design.choice');
  if (!gateEvents.length && choice?.by !== 'owner') lines.push('- nothing beyond approvals');
  for (const e of gateEvents) lines.push(`- at "${e.gate}": ${truncate(e.feedback, 400)}`);
  if (choice?.by === 'owner') lines.push(`- design direction: ${truncate(choice.text, 400)}`);

  lines.push('', '### Steps that failed, were retried or were refused actions');
  const trouble = steps.filter(([, s]) => s.status === 'failed' || s.error || s.denials?.length);
  if (!trouble.length) lines.push('- none');
  for (const [id, s] of trouble.slice(0, 30)) {
    lines.push(`- ${id} (${s.role}): ${s.error ? truncate(s.error, 200) : ''}${s.denials?.length ? ` refused: ${truncate(s.denials.join('; '), 240)}` : ''}`);
  }

  lines.push('', '### Lessons proposed by the agents themselves (unverified: keep only what the record supports)');
  const proposed = steps.flatMap(([, s]) => (s.report?.lessons ?? []).map((l) => ({ role: s.role, ...l })));
  if (!proposed.length) lines.push('- none');
  for (const l of proposed.slice(0, 80)) lines.push(`- ${l.role} (${l.scope}): ${truncate(l.lesson, 300)}`);

  lines.push('', '### Effort by role');
  for (const [role, r] of perRole) lines.push(`- ${role}: ${r.steps} step(s), ${formatDuration(r.ms)}, ${r.findingsAgainst} finding(s) owned`);

  return { text: lines.join('\n'), findings, sentBack: sentBack.length };
}

export function runMetrics(run, extra = {}) {
  const { state } = run;
  const steps = Object.entries(state.data.steps);
  const reviews = state.data.events.filter((e) => e.type === 'review');
  const firstPass = reviews.filter((e) => e.round === 1);
  const findings = steps.filter(([id]) => /^verify\./.test(id)).flatMap(([, s]) => s.report?.findings ?? []);
  const codeReviews = steps.filter(([id]) => /\.review\.[^.]+\.r1$/.test(id) && !/^(survey|design|architecture|discovery)\./.test(id));
  const totals = state.totals();
  return {
    run: state.id,
    project: path.basename(run.projectDir),
    status: state.data.status,
    directorEngine: run.modes.directorEngine,
    steps: totals.steps,
    durationMin: Math.round(totals.durationMs / 60000),
    costUsd: Number(totals.costUsd.toFixed(2)),
    phaseReviews: firstPass.length,
    phaseReviewsApprovedFirstTime: firstPass.filter((e) => e.verdict === 'approve').length,
    codeReviews: codeReviews.length,
    codeReviewsApprovedFirstTime: codeReviews.filter(([, s]) => s.report?.verdict === 'approve').length,
    verifyRounds: state.data.events.filter((e) => e.type === 'verify').length,
    blockers: findings.filter((f) => f.severity === 'blocker').length,
    majors: findings.filter((f) => f.severity === 'major').length,
    minors: findings.filter((f) => f.severity === 'minor').length,
    ownerRevisions: state.data.events.filter((e) => e.type === 'gate' && e.feedback).length,
    ...extra,
  };
}

export async function retrospective(run) {
  const { state, ui } = run;
  const record = runRecord(run);
  const roles = Object.keys(run.team.roles);

  const retro = await run.decide({
    id: 'retro.learn',
    title: 'Retrospective: what should the team learn from this run?',
    schema: RETROSPECTIVE,
    schemaName: 'retrospective',
    memory: false,
    task: `The run is over. Your job now is to make the next run better than this one. Below is the factual record of what happened and the team's current memory.

Write lessons that would have changed the outcome had the role known them at the start. A good lesson is specific, states the situation it applies to, and tells the role what to do: "When a form has more than one step, the UX specification must define what happens to entered data on browser back; QA found data loss on two of three such forms." A bad lesson is a platitude ("test more carefully"), a description of this product only (that belongs in project_facts), or a one-off accident.

- role_lessons: for the role that could have prevented a problem, not the one that found it. Give the evidence from the record. Only durable, general lessons; none is a fine answer for a role that did well.
- team_lessons: about hand-offs, sequencing and communication between roles.
- owner_preferences: what this owner has shown they want or dislike, in taste, scope, process or communication, that will hold on future products. Only what the record supports; do not restate their verbatim feedback, which is already stored.
- project_facts: decisions, conventions and constraints of this product that a future run on it must know.
- retire_lesson_ids: ids of existing lessons that this run showed to be wrong, that are now covered by a better one, or that duplicate each other. Where a role's list is marked as too long, consolidate it: retire the weakest and the duplicates and write merged lessons in their place.
- skill_proposals: only when the run revealed a repeatable multi-step procedure that a role had to work out and will need again. Give the role, a short name, a one-sentence description starting "Use when", and the full procedure as the body. Most runs should propose none.

Do not repeat a lesson that memory already contains unless you are confirming it with new evidence, in which case restate it in nearly the same words so it is counted as confirmed.

## Record of this run

${record.text}

## Current memory (ids in brackets)

${memory.dumpForCuration({ roles, projectDir: run.projectDir })}`,
  });

  const meta = { run: state.id, project: path.basename(run.projectDir) };
  let learned = 0;
  for (const l of retro.role_lessons ?? []) {
    if (!run.team.roles[l.role]) continue;
    if (memory.remember('role', l.lesson, { role: l.role, evidence: l.evidence, ...meta })) learned++;
  }
  for (const l of retro.team_lessons ?? []) if (memory.remember('team', l, meta)) learned++;
  for (const l of retro.owner_preferences ?? []) if (memory.remember('owner', l, { ...meta, source: 'inferred' })) learned++;
  for (const l of retro.project_facts ?? []) if (memory.remember('project', l, { ...meta, projectDir: run.projectDir })) learned++;
  const retired = memory.retire(retro.retire_lesson_ids ?? [], { projectDir: run.projectDir });

  // A learned skill changes how a role works from now on, so the owner is asked when present.
  const added = [];
  for (const proposal of retro.skill_proposals ?? []) {
    if (!run.team.roles[proposal.role]) continue;
    if (ui.interactive) {
      console.log(`\n${c.bold('The director proposes a new skill')} for the ${run.team.roles[proposal.role].title}: ${c.cyan(proposal.name)}\n${c.dim(truncate(proposal.description, 300))}`);
      if (!(await ui.confirm('Add it to the team?', { fallback: true }))) continue;
    }
    const skill = writeLearnedSkill(proposal);
    if (!skill) continue;
    attachLearnedSkill(proposal.role, skill.name);
    added.push(`${skill.name} → ${proposal.role}`);
  }
  if (added.length) buildTeam();

  // The retrospective is the last phase, so a run that reaches it has completed.
  memory.recordMetrics(runMetrics(run, { status: 'done', lessonsLearned: learned, lessonsRetired: retired, skillsLearned: added.length }));
  const committed = memory.commitMemory(`learn: run ${state.id} (${learned} lesson(s), ${retired} retired, ${added.length} skill(s))`);

  banner('What the team learned');
  console.log(retro.summary.trim());
  ok(`${learned} lesson(s) stored, ${retired} retired${added.length ? `, new skill(s): ${added.join(', ')}` : ''}`);
  info(`Memory lives in ${memory.MEMORY_DIR}${committed ? ' (committed to the harness repository)' : ''}; edit or delete anything there.`);
}
