import fs from 'node:fs';
import { truncate } from '../util.mjs';
import { info, warn } from '../ui.mjs';
import { RELEASE_DECISION } from '../schemas.mjs';
import { needsHuman } from '../modes.mjs';
import { PauseRun } from '../run.mjs';

/**
 * Launch material (marketing and sales), then release: the platform engineer prepares
 * delivery, security reviews it, the director makes the go / no-go call, and nothing is
 * deployed or published until the go-live approval the owner's chosen mode requires.
 */

export async function launch(run) {
  if (!run.modes.business) return;
  const exists = (p) => fs.existsSync(run.abs(p));
  const context = [run.doc('product/PRD.md'), run.doc('product/brief.md'), run.doc('research/market-research.md'), run.doc('marketing/positioning.md')].filter(exists);

  await run.all([
    () =>
      run.work({
        id: 'launch.marketing',
        role: 'marketing',
        title: 'Prepare the launch plan and launch copy',
        task: `The product is built. Prepare what is needed to bring it to market, grounded in the positioning, the research and what was actually built (read the PRD's final scope; do not promise what is not there).

Deliver ${run.doc('marketing/launch-plan.md')}: the launch goal and the numbers that define success; the audience and channels in priority order with the reason for each; the launch sequence week by week, before, during and after; final copy ready to use for the main surfaces (landing page sections, product description at three lengths, announcement post, launch email, social posts) in the product's voice; the search strategy (the queries real buyers use, page-level recommendations); the first growth experiments with hypothesis, metric and stop condition; and what must be measured from day one.`,
        readFirst: context,
        deliver: [run.doc('marketing/launch-plan.md')],
      }),
    () =>
      run.work({
        id: 'launch.sales',
        role: 'sales',
        title: 'Prepare the sales kit',
        task: `Prepare what someone needs to sell this product, grounded in the research and in what was actually built.

Deliver ${run.doc('sales/sales-kit.md')}: the ideal customer profile with qualifying and disqualifying signals; the buyer and user personas and what each cares about; pricing and packaging with the reasoning and the comparison to alternatives; the pitch at thirty seconds and at two minutes; a demo script that follows the product's real flows; discovery questions; the objections you expect with honest answers; competitor comparisons that are fair and current; and a first outreach sequence. Mark every claim that needs proof the team does not yet have.`,
        readFirst: context,
        deliver: [run.doc('sales/sales-kit.md')],
      }),
  ]);
  await run.commit('launch plan and sales kit');
}

export async function release(run) {
  const { state, modes } = run;
  const exists = (p) => fs.existsSync(run.abs(p));
  const PL =(rel) => run.doc(`platform/${rel}`);
  const context = [PL('deployment-plan.md'), run.doc('engineering/architecture.md'), run.doc('qa/test-strategy.md'), run.doc('security/threat-model.md')].filter(exists);
  const brownfield = run.hasKnowledge();

  await run.work({
    id: 'release.prepare',
    role: 'platform-engineer',
    title: 'Build the delivery pipeline and release configuration',
    timeoutMin: 180,
    task: `Make the product deployable, following the deployment plan${brownfield ? ' and the way this product is already delivered (read the deployment map and extend what exists rather than replacing it)' : ''}. Build and commit everything deployment needs: the container or build configuration; the CI/CD pipeline with the quality gates from the test strategy (build, lint, types, tests, security scans) and separate preview, staging and production stages; infrastructure or platform configuration as code; environment-variable templates that document every setting without containing any secret; database migration and seed steps; health checks; logging, error tracking and monitoring hooks; and security headers and other production hardening.

Prove it works as far as you can without going live: build the production artefact locally, run it, run the pipeline's steps locally, and validate the configuration files with the platform's own tooling where that needs no credentials.

Do not deploy, publish, push or create any cloud resource in this step: those commands are blocked until go-live is approved. Write ${PL('runbook.md')}: the exact commands to deploy, verify, roll back and restore; the accounts, credentials, domains and secrets the owner must provide, each with where to get it and where it goes; the first-deployment checklist; and what to watch in the first hour.`,
    readFirst: [...context, ...(brownfield ? [run.doc('knowledge/deployment.md')].filter(exists) : [])],
    deliver: [PL('runbook.md')],
  });
  await run.commit('delivery pipeline and release configuration');

  const securityReport = await run.work({
    id: 'release.security',
    role: 'security-engineer',
    title: 'Security review of the deployment',
    task: `Review how the product will be delivered and run: the CI/CD pipeline (permissions, secret handling, untrusted input, third-party actions pinned by commit), container and build configuration (base images, users, exposed ports), infrastructure and platform configuration (network exposure, identity and access, storage, encryption, backups), environment and secrets management, security headers and transport security, logging of sensitive data, and the runbook's handling of credentials. Check them against current hardening guidance for this platform, looked up now. Report each problem as a finding with location, risk and fix, owned by the platform-engineer.`,
    readFirst: [PL('runbook.md'), ...context],
    deliver: [run.doc('security/deployment-review.md')],
  });
  const mustFix = (securityReport.findings ?? []).filter((f) => f.severity === 'blocker' || f.severity === 'major');
  if (mustFix.length) {
    await run.work({
      id: 'release.security-fixes',
      role: 'platform-engineer',
      title: 'Fix the deployment security findings',
      resumeFrom: 'release.prepare',
      task: 'The security engineer reviewed the delivery pipeline and configuration and found problems that must be fixed before release. Fix each one, verify the configuration still builds and validates, and update the runbook if procedures changed.',
      feedback: mustFix.map((f, i) => `${i + 1}. [${f.severity}] ${f.title} (${f.location}): ${f.details}`).join('\n'),
    });
  }
  await run.commit('deployment security review');

  const decision = await run.decide({
    id: 'release.decision',
    title: 'Go / no-go for release',
    schema: RELEASE_DECISION,
    schemaName: 'release_decision',
    task: `Decide whether this product is ready to go live. Check the release criteria in the PRD one by one against the evidence: the QA verification report, the security reviews of the product and of the deployment, the design QA, and the runbook. Check that what was deferred during verification is acceptable to ship without. "Go" means you would put it in front of real customers today; "no-go" means name exactly what is missing. List under conditions anything that must happen at or right after launch, and what the owner must provide before a deployment is possible.`,
    readFirst: [run.doc('product/PRD.md'), run.doc('qa/product-verification.md'), run.doc('qa/test-report.md'), run.doc('security/security-review.md'), run.doc('security/deployment-review.md'), run.doc('design/design-qa.md'), PL('runbook.md')].filter(exists),
  });
  state.event('release-decision', { verdict: decision.verdict });
  if (decision.verdict !== 'go') {
    throw new PauseRun(`The director's release decision is no-go: ${truncate(decision.summary, 400)}\nEverything built so far is on branch ${state.data.branch}. Run "harness resume" after addressing it, or deploy yourself from ${PL('runbook.md')}.`);
  }

  await run.gate('golive', {
    phase: 'release',
    title: 'Go live',
    summary: `The director recommends going live: ${decision.summary}${decision.conditions?.length ? `\n\nConditions:\n${decision.conditions.map((x) => `- ${x}`).join('\n')}` : ''}\n\nApproving lets the platform engineer deploy and publish with the credentials available on this machine.`,
    artifacts: [PL('runbook.md'), run.doc('qa/product-verification.md'), run.doc('security/security-review.md')].filter(exists),
  });
  if (!needsHuman(modes, 'golive')) info('Approvals mode is fully autonomous: the director\'s go decision authorises the deployment.');

  const deploy = await run.work({
    id: 'release.deploy',
    role: 'platform-engineer',
    title: 'Deploy to production',
    goliveUnlocked: true,
    resumeFrom: 'release.prepare',
    timeoutMin: 120,
    task: `Go-live is approved. Deploy the product following the runbook: first to a preview or staging environment and verify it, then to production. Before each irreversible step, check that you are targeting the right account, project and environment. Apply database migrations as planned, confirm health checks, and confirm the production URL serves the new version. If anything fails, roll back using the runbook and report what happened; do not improvise on production.

If you cannot deploy because credentials, accounts, a CLI login or a domain are missing, do not work around it and do not create accounts: report status "blocked" with the exact steps the owner must take, in order, and the single command to run afterwards. Record the deployed URLs and versions in ${PL('deployments.md')}.`,
    readFirst: [PL('runbook.md'), PL('deployment-plan.md')].filter(exists),
    deliver: [PL('deployments.md')],
  });
  await run.commit('deployment record');

  if (deploy.status !== 'done') {
    warn(`The product is ready but not deployed: ${truncate(deploy.handoff || deploy.summary, 300)}`);
    state.set('release.deployed', false);
    return;
  }
  state.set('release.deployed', true);

  await run.work({
    id: 'release.smoke',
    role: 'staff-qa',
    title: 'Smoke-test the live product',
    task: `The product has been deployed; the URLs are in ${PL('deployments.md')}. Verify the live deployment the way a first customer would meet it: every critical journey in the product flows document, in a real browser where there is a UI, plus health endpoints, security headers, TLS, error tracking receiving events, and that no test data or debug output is exposed. Use only test accounts and non-destructive actions. Report any failure as a blocker finding owned by the platform-engineer, with evidence.`,
    readFirst: [PL('deployments.md'), run.doc('product/product-flows.md'), run.doc('qa/test-strategy.md')].filter(exists),
    deliver: [run.doc('qa/live-smoke-test.md')],
  });
  await run.commit('live smoke test');
}
