import fs from 'node:fs';
import { readJson, HarnessError } from '../util.mjs';
import { validateTasks } from '../schemas.mjs';
import { hasUI } from '../modes.mjs';

/**
 * Architecture: the principal engineer decides how it is built; QA, security and platform
 * plan their side against that design; the staff engineer turns it all into a task graph
 * that several senior engineers can execute in parallel without colliding.
 */

export function loadTasks(run, relFile) {
  const file = run.abs(relFile);
  if (!fs.existsSync(file)) return { tasks: null, problems: [`${relFile} was not written`] };
  let tasks;
  try {
    tasks = readJson(file);
  } catch (err) {
    return { tasks: null, problems: [err.message] };
  }
  return { tasks, problems: validateTasks(tasks) };
}

export async function architecture(run) {
  const { modes } = run;
  const E = (rel) => run.doc(`engineering/${rel}`);
  const P = (rel) => run.doc(`product/${rel}`);
  const exists = (p) => fs.existsSync(run.abs(p));
  const ui = hasUI(modes);
  const product = [P('PRD.md'), P('brief.md')];
  const designDocs = ui ? [run.doc('design/design-system.md'), run.doc('design/screens.md'), run.doc('design/ux.md')].filter(exists) : [];
  const knowledge = run.hasKnowledge() ? [run.doc('knowledge/INDEX.md'), run.doc('knowledge/CODEBASE.md')] : [];
  const brownfield = run.hasKnowledge();

  await run.work({
    id: 'architecture.design',
    role: 'principal-engineer',
    title: 'Design the architecture',
    timeoutMin: 180,
    task: `Decide how this product is built. You are accountable for it still being a good decision in two years. ${brownfield ? 'This is a change to an existing product: design it to fit the system that exists, following its conventions, and justify every place where you introduce something new. Read the relevant area documents and the code they point to before deciding.' : 'Choose the simplest architecture that meets the requirements and the quality numbers in the PRD, with boring, well-supported technology unless something specific demands otherwise.'}

Deliver:
- ${E('architecture.md')}: context and constraints; the architecture with a diagram in text; the components and each one's responsibility; the technology choices, each with the alternatives considered and why they lost (including buy or use-a-service versus build); the data model with entities, relationships, keys, indexes and the reasoning; the API or interface contracts precisely enough to build against from both sides; authentication, authorisation and tenancy; how each quality requirement in the PRD is met (performance budgets, accessibility, privacy, reliability) and how it will be measured; the scalability path: what load this design carries, what breaks first, and what you would change at ten and a hundred times the load; error handling, logging and observability; the migration and rollout plan${brownfield ? ', including backward compatibility and data migration' : ''}; what we are deliberately not building and why; and the risks with their mitigations.
- ${E('adr/')}: one short architecture decision record per significant decision (context, decision, alternatives, consequences).
- ${P('product-flows.md')}: the product's flows for the other teams: for each user journey in the PRD, the screens, the system components involved, the data that moves, and the failure points. QA, security and platform will plan from this document, so write it for them.

Verify what you can: check that the libraries and services you choose exist, are maintained, are licensed acceptably and support what you need, using their current documentation. Do not specify an API from memory.`,
    readFirst: [...product, ...designDocs, ...knowledge],
    deliver: [E('architecture.md'), E('adr/'), P('product-flows.md')],
  });
  await run.commit('architecture');

  const arch = [E('architecture.md'), P('product-flows.md'), P('PRD.md')];
  await run.all([
    () =>
      run.work({
        id: 'architecture.test-strategy',
        role: 'principal-qa',
        title: 'Write the test strategy',
        task: `Define how this team will know the product works, for the whole product and not only the new parts.

Deliver ${run.doc('qa/test-strategy.md')}: the quality risks ranked by likelihood and impact; the test levels and what each is responsible for (unit, integration, contract, end-to-end, visual, accessibility, performance, security) with the tools${brownfield ? ', matched to what the product already uses' : ''}; a traceability matrix from every PRD story and acceptance criterion to the tests that will prove it; the product-flow regression map: every end-to-end journey in the product flows document, what could break it, and how it is checked on every change; test data and environments; non-functional targets and how they are measured; the quality gates: exactly what must pass before a task merges, before the product is accepted, and before release; and what will be explored by hand in a browser and why.

Be concrete enough that the staff QA engineer can execute it without asking you.`,
        readFirst: [...arch, ...designDocs, ...knowledge, ...(brownfield ? [run.doc('knowledge/testing.md')].filter(exists) : [])],
        deliver: [run.doc('qa/test-strategy.md')],
      }),
    () =>
      run.work({
        id: 'architecture.threat-model',
        role: 'security-engineer',
        title: 'Threat-model the design',
        task: `Find the security problems in this design now, while they are cheap to fix.

Deliver ${run.doc('security/threat-model.md')}: the assets worth protecting; the actors and trust boundaries; the data flows across those boundaries; the threats against each (work through spoofing, tampering, repudiation, information disclosure, denial of service and elevation of privilege, and the abuse cases specific to this product); for each threat its likelihood, impact, and the control that addresses it; and the security requirements that follow, numbered and testable, covering authentication, session handling, authorisation on every object and action, input handling, secrets, data protection and privacy, dependencies, logging and rate limiting.

Research what is being exploited right now in this kind of product and this technology stack (recent advisories, known-exploited vulnerability lists, incident write-ups) and say how the design stands against each. Cite sources with dates. Record every weakness in the architecture as a finding for the principal engineer, with the fix you recommend.`,
        readFirst: [...arch, ...knowledge, ...(brownfield ? [run.doc('knowledge/security-baseline.md')].filter(exists) : [])],
        deliver: [run.doc('security/threat-model.md')],
      }),
    () =>
      run.work({
        id: 'architecture.deployment-plan',
        role: 'platform-engineer',
        title: 'Plan hosting, environments and delivery',
        task: `Decide where and how this product runs. ${brownfield ? 'The product already has a home: read the deployment map, plan this change to fit it, and propose a change of platform only if the existing one cannot carry the requirement.' : 'Compare the realistic options for this specific product (for example Vercel, Railway, Render, Fly.io, Netlify, Cloudflare, a container platform on AWS, Google Cloud or Azure, or Kubernetes) against its actual needs: workload shape, data stores, background work, regions, compliance, team size, expected load and budget. Recommend one, with the runner-up and why it lost. Prefer the least operational burden that meets the requirements.'}

Deliver ${run.doc('platform/deployment-plan.md')}: the target platform and architecture of the deployment; environments (local, preview, staging, production) and how they differ; the CI/CD pipeline stage by stage, including the quality gates from the test strategy; how configuration and secrets are managed in each environment; databases and managed services, with backups, migrations and restore; domains, DNS and TLS; observability: logs, metrics, traces, error tracking, alerts and what pages a human; the release strategy and the rollback procedure; capacity and a cost estimate at launch and at ten times the load, with current prices checked against the vendors' pricing pages; and what the owner must provide (accounts, credentials, domains) before a deployment can happen.

Record anything in the architecture that will be painful to operate as a finding for the principal engineer.`,
        readFirst: [...arch, ...knowledge, ...(brownfield ? [run.doc('knowledge/deployment.md')].filter(exists) : [])],
        deliver: [run.doc('platform/deployment-plan.md')],
      }),
  ]);

  await run.work({
    id: 'architecture.reconcile',
    role: 'principal-engineer',
    title: 'Reconcile the architecture with QA, security and platform',
    resumeFrom: 'architecture.design',
    task: `QA, security and platform have planned against your design and raised findings. Read the three documents. For every finding addressed to you, change the architecture or record in the relevant ADR why you will not. Make sure the security requirements, the quality gates and the deployment plan are all reflected in the architecture and consistent with one another, and update the product flows document if anything moved.`,
    readFirst: [run.doc('qa/test-strategy.md'), run.doc('security/threat-model.md'), run.doc('platform/deployment-plan.md'), E('architecture.md')],
    deliver: [E('architecture.md')],
  });

  const tasksFile = E('tasks.json');
  await run.work({
    id: 'architecture.plan',
    role: 'staff-engineer',
    title: 'Write the implementation plan and task breakdown',
    timeoutMin: 180,
    task: `Turn the architecture${ui ? ' and the design' : ''} into a plan that ${modes.engineers} senior engineer${modes.engineers > 1 ? 's' : ''} can execute in parallel, each in an isolated git worktree, without stepping on each other.

Deliver:
- ${E('implementation-plan.md')}: the build order and why; the shared foundations that must exist first (project scaffold, tooling, design tokens, data schema, shared types and contracts) and the conventions everyone follows (structure, naming, error handling, testing, commits); the interfaces between tasks, fixed precisely so that parallel work fits together; and the integration risks and how the order reduces them.
- ${tasksFile}: a JSON array of tasks. Each task is an object with:
  - "id": short, lowercase with dashes
  - "title"
  - "description": everything the engineer needs: what to build, where, against which contract, following which pattern, with references to the exact sections of the architecture, design and PRD${brownfield ? ', and the knowledge documents and existing files to read first' : ''}
  - "acceptance": checkable criteria, including the tests that must exist and pass and the PRD acceptance criteria this task satisfies
  - "depends_on": ids of tasks that must be merged first
  - "files": the main paths the task creates or changes
  - "owner": "senior-engineer" (or another role when the work is theirs, such as "platform-engineer")

Rules for the breakdown: each task is one engineer's coherent piece of work that leaves the product building and its tests passing when merged; a task states its interface, not just its topic; two tasks that can run at the same time must not edit the same files; everything in the PRD's must-haves, every screen in the specification, every security requirement and every quality gate is covered by some task; the first task or tasks set up the foundations others depend on; and tests are part of each task, not a task at the end. Prefer more, smaller, independent tasks over a few large ones, but never split something that only makes sense whole.`,
    readFirst: [E('architecture.md'), P('product-flows.md'), P('PRD.md'), ...designDocs, run.doc('qa/test-strategy.md'), run.doc('security/threat-model.md'), run.doc('platform/deployment-plan.md'), ...knowledge],
    deliver: [E('implementation-plan.md'), tasksFile],
  });

  // The task file drives the build, so it is checked mechanically and sent back once if malformed.
  let { problems } = loadTasks(run, tasksFile);
  if (problems.length) {
    await run.work({
      id: 'architecture.plan-fix',
      role: 'staff-engineer',
      title: 'Fix the task breakdown file',
      resumeFrom: 'architecture.plan',
      task: `The harness could not use ${tasksFile}. Fix the file so it is a valid JSON array in the required format.`,
      feedback: problems.map((p) => `- ${p}`).join('\n'),
      deliver: [tasksFile],
    });
    ({ problems } = loadTasks(run, tasksFile));
    if (problems.length) throw new HarnessError(`${tasksFile} is still invalid: ${problems.join('; ')}`);
  }
  await run.commit('test strategy, threat model, deployment plan and implementation plan');

  await run.reviewLoop('architecture', {
    title: 'Architecture and plan',
    artifacts: [E('architecture.md'), E('implementation-plan.md'), tasksFile, P('product-flows.md'), run.doc('qa/test-strategy.md'), run.doc('security/threat-model.md'), run.doc('platform/deployment-plan.md'), P('PRD.md')],
    guidance: `You are not reviewing the engineering for elegance; you are checking that the plan delivers the product. Is every must-have in the PRD covered by the architecture and by a task? Do the test strategy, the threat model and the deployment plan agree with the architecture and with each other? Is anything being built that the PRD did not ask for? Are the risks named and owned? Is the scope realistic? If you send the task breakdown back to the staff-engineer, it must remain a valid file in the same format.`,
  });

  ({ problems } = loadTasks(run, tasksFile));
  if (problems.length) throw new HarnessError(`${tasksFile} became invalid during review: ${problems.join('; ')}`);

  await run.gate('architecture', {
    phase: 'architecture',
    title: 'Architecture and plan',
    summary: 'The architecture, test strategy, threat model, deployment plan and task breakdown are ready and the boss has reviewed them.',
    artifacts: [E('architecture.md'), E('implementation-plan.md'), run.doc('platform/deployment-plan.md'), run.doc('security/threat-model.md')],
  });
}
