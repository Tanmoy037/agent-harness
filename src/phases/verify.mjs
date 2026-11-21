import fs from 'node:fs';
import path from 'node:path';
import { c, writeJson, truncate } from '../util.mjs';
import { info, warn } from '../ui.mjs';
import { TRIAGE, validateTasks } from '../schemas.mjs';
import { hasUI } from '../modes.mjs';
import { PauseRun } from '../run.mjs';
import { runTasks } from './build.mjs';

/**
 * Verify: QA, security and design each examine the built product independently, the boss
 * decides what must be fixed, engineers fix it, and the whole product is examined again.
 * The loop ends when the boss accepts the product against the PRD.
 */

const collectFindings = (reports) =>
  reports.flatMap(({ role, report }) => (report.findings ?? []).map((f) => ({ from: role, ...f })));

export async function verify(run) {
  const { state, modes, options, ui } = run;
  const P = (rel) => run.doc(`product/${rel}`);
  const E = (rel) => run.doc(`engineering/${rel}`);
  const exists = (p) => fs.existsSync(run.abs(p));
  const withUI = hasUI(modes) && run.docExists('design/design-system.md');
  const base = [P('PRD.md'), P('product-flows.md'), E('architecture.md')].filter(exists);
  const brownfield = run.hasKnowledge();
  let accepted = state.get('verify.accepted', false);

  for (let loop = 1; !accepted && loop <= options.verifyLoops; loop++) {
    const again = loop > 1 ? ` This is verification round ${loop}: fixes were made since the last round. Re-check everything that was reported, and check again that the fixes broke nothing else.` : '';
    const jobs = [
      {
        role: 'staff-qa',
        title: 'Test the product: automated and in the browser',
        task: `Execute the test strategy against the built product. Write and run the automated tests it calls for at every level, and make them part of the repository so they run on every change. Then drive the real product${withUI ? ' in a real browser at phone and desktop widths' : ''}: every acceptance criterion of every must-have story in the PRD, the unhappy paths, the edge cases, bad input, slow and failed network, and the boundaries between features.${withUI ? ' Check accessibility with tooling and by keyboard, and check performance against the PRD targets.' : ''}

Report every defect as a finding with exact reproduction steps, expected and actual behaviour, and evidence (failing test, screenshot, log). Set the owner to whoever should fix it. Separate what you verified by running it from what you only read. State the test results as numbers: how many tests exist, how many pass.${again}`,
        readFirst: [run.doc('qa/test-strategy.md'), ...base, ...(withUI ? [run.doc('design/screens.md')] : [])].filter(exists),
        deliver: [run.doc('qa/test-report.md')],
      },
      {
        role: 'principal-qa',
        title: 'Verify the whole product end to end',
        task: `Judge whether the product as a whole is ready, not whether individual features work. Walk every journey in the product flows document from start to finish in the running product, as each kind of user, and check that the journeys connect: state carries across screens, nothing built for one feature breaks another, data stays consistent, and the product behaves as one thing.${brownfield ? ' This is a change to an existing product: run the existing regression suites and walk the existing flows that the change could have touched; nothing that worked before may be broken.' : ''} Go through the traceability matrix: for every PRD story and acceptance criterion, record pass, fail or not verifiable, with the evidence. Check the release criteria in the PRD and the quality gates in the test strategy one by one.

Report gaps and regressions as findings with reproduction steps and the owner who should fix each. Finish with a clear statement: which release criteria are met, which are not, and what you could not verify.${again}`,
        readFirst: [run.doc('qa/test-strategy.md'), ...base, ...(brownfield ? [run.doc('knowledge/testing.md')] : [])].filter(exists),
        deliver: [run.doc('qa/product-verification.md')],
      },
      {
        role: 'security-engineer',
        title: 'Security review of the built product',
        task: `Review what was actually built, not what was planned. Check every security requirement in the threat model against the code and the running product, and record pass or fail with evidence. Review the code for the classes of vulnerability that matter in this stack: broken access control on every object and action, authentication and session flaws, injection, cross-site scripting, request forgery, server-side request forgery, unsafe deserialisation and file handling, secrets in code or logs, weak cryptography, missing rate limits, and unsafe defaults. Run the static analysis, dependency audit and secret scanning tools available to you. Audit the dependencies and the build pipeline for supply-chain risk.

Then research what is being actively exploited now in the technologies this product uses (current advisories, known-exploited lists, recent incident reports) and check the product against each. Cite sources with dates.

Report each vulnerability as a finding with its location, how it would be exploited, its severity, and the fix. Confirm a finding is real before reporting it. Fix nothing yourself in this step.${again}`,
        readFirst: [run.doc('security/threat-model.md'), ...base].filter(exists),
        deliver: [run.doc('security/security-review.md')],
      },
      ...(withUI
        ? [
            {
              role: 'staff-designer',
              title: 'Design QA: compare the built product with the design',
              task: `Hold the built product against the design you made. Run it, open every screen at phone and desktop widths, screenshot each, and compare side by side with the prototype screenshots and the design system: typography, colour, spacing, alignment, component states, motion, responsive behaviour, focus and hover states, empty, loading and error states, and real content that is longer or shorter than the mock. Then step back and judge the whole as a customer would: does it look and feel like the product you designed, made with care, or did it drift toward something generic during the build? Run the slop check on the built screens.

Report each deviation as a finding with the screen, a screenshot, what the design specifies and what was built, with the engineer who should fix it as owner. Where the design itself turns out to be wrong now that it is real, fix the design documents and say so.${again}`,
              readFirst: [run.doc('design/design-system.md'), run.doc('design/screens.md'), run.doc('design/prototype/'), run.doc('design/tokens.css')].filter(exists),
              deliver: [run.doc('design/design-qa.md')],
            },
          ]
        : []),
    ];

    const reports = await run.all(
      jobs.map((job) => async () => ({
        role: job.role,
        report: await run.work({ id: `verify.r${loop}.${job.role}`, timeoutMin: 180, ...job }),
      })),
    );
    await run.commit(`verification round ${loop}`);

    const findings = collectFindings(reports);
    const counts = findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {});
    info(`Verification round ${loop}: ${findings.length} finding(s)${findings.length ? ` (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`);
    state.event('verify', { loop, findings: findings.length, ...counts });

    const triage = await run.decide({
      id: `verify.r${loop}.triage`,
      title: 'Accept the product or send it back',
      schema: TRIAGE,
      schemaName: 'triage',
      task: `QA, security${withUI ? ' and design' : ''} have examined the built product. Decide whether you accept it against the PRD.

Read their reports, and check the important claims yourself against the product: you are the one who signs. Go through the PRD's must-have stories and release criteria one by one. Accept only when every must-have works, no blocker or major finding remains, the security review has no open vulnerability of consequence${withUI ? ', and the product looks and feels like the approved design rather than a generic template' : ''}.

If you do not accept, turn what must be fixed into fix tasks: each with a short lowercase id, a title, a description precise enough to act on (the finding, where it is, how to reproduce it, what correct looks like), acceptance criteria, and the owner role who should do it (senior-engineer for product code, staff-designer or platform-engineer when the work is theirs). Group related findings into one task; keep unrelated ones apart so they can be fixed in parallel. Put what can wait in "deferred" with the reason. ${loop === options.verifyLoops ? 'This is the last fix round the run allows: be strict about what truly blocks acceptance.' : ''}

Findings reported (${findings.length}):
${truncate(JSON.stringify(findings, null, 1), 40_000).replace(/…$/, '\n… (truncated; read the reports)')}`,
      readFirst: [...base, ...jobs.flatMap((j) => j.deliver)].filter(exists),
    });

    if (triage.verdict === 'accept' || !triage.fix_tasks?.length) {
      accepted = true;
      state.set('verify.accepted', true);
      state.set('verify.deferred', triage.deferred ?? []);
      info(`The boss accepted the product: ${truncate(triage.summary, 200)}`);
      break;
    }

    const tasks = triage.fix_tasks.map((t, i) => ({
      id: `fix${loop}-${String(t.id || i + 1).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || i + 1}`,
      title: t.title,
      description: t.description,
      acceptance: t.acceptance || 'The reported problem no longer reproduces, a test covers it, and the full test suite passes.',
      owner: t.owner,
      depends_on: [],
    }));
    // Two findings can produce the same id; make them unique rather than failing the run.
    const seen = new Map();
    for (const t of tasks) {
      const n = (seen.get(t.id) ?? 0) + 1;
      seen.set(t.id, n);
      if (n > 1) t.id = `${t.id}-${n}`;
    }
    const problems = validateTasks(tasks);
    if (problems.length) warn(`Some fix tasks were malformed and were skipped: ${problems.join('; ')}`);
    const usable = problems.length ? tasks.filter((t) => t.title && t.description) : tasks;
    writeJson(path.join(state.dir, `fix-tasks-r${loop}.json`), usable);
    run.log(c.yellow(`↺ The boss sent the product back with ${usable.length} fix task(s): ${truncate(triage.summary, 160)}`));

    await runTasks(run, usable, {
      prefix: `fix${loop}`,
      context: [E('architecture.md'), E('implementation-plan.md'), P('PRD.md'), ...jobs.flatMap((j) => j.deliver)].filter(exists),
    });
    await run.commit(`fixes after verification round ${loop}`);
  }

  if (!accepted && !state.get('verify.override')) {
    const msg = `The boss has not accepted the product after ${options.verifyLoops} verification rounds.`;
    if (ui.interactive && (await ui.confirm(`${msg} Continue to release preparation anyway?`, { fallback: false }))) {
      state.set('verify.override', true);
      warn('Continuing at your instruction with open findings; see the QA and security reports.');
    } else {
      throw new PauseRun(`${msg} Read the reports under ${run.docsDir}/qa and ${run.docsDir}/security, then run "harness resume" to decide.`);
    }
  }
}
