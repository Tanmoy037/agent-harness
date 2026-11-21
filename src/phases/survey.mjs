import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, writeText, HarnessError } from '../util.mjs';
import { info, warn } from '../ui.mjs';
import { takeInventory, renderInventory, isExistingCodebase } from '../inventory.mjs';
import { head, commitExists, changedFilesSince } from '../git.mjs';
import * as memory from '../memory.mjs';

/**
 * Phase 0 for an existing product: understand it before changing it.
 *
 * No single agent can hold a large, old, multi-language codebase in its head, so the
 * principal engineer divides it into areas, several staff engineers each go deep on one
 * area in parallel, platform, QA and security map how it is deployed, tested and secured,
 * and the principal assembles a navigable knowledge base. Every later agent starts from
 * that map instead of rediscovering the codebase. The boss is briefed last and can send
 * the engineers back for more depth. There is no time pressure in this phase.
 */

const AREA_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

function validateAreas(areas, { allowEmpty }) {
  if (!Array.isArray(areas)) return ['must be a JSON array'];
  if (!areas.length) return allowEmpty ? [] : ['must list at least one area'];
  const problems = [];
  const ids = new Set();
  for (const a of areas) {
    if (!a || typeof a !== 'object') {
      problems.push('every entry must be an object');
      continue;
    }
    if (!AREA_ID.test(a.id ?? '')) problems.push(`bad id "${a.id}" (lowercase letters, digits, dashes)`);
    if (ids.has(a.id)) problems.push(`duplicate id "${a.id}"`);
    ids.add(a.id);
    if (!a.name) problems.push(`${a.id}: missing name`);
    if (!Array.isArray(a.paths) || !a.paths.length) problems.push(`${a.id}: paths must be a non-empty array`);
  }
  return problems;
}

const AREA_TEMPLATE = `Use these sections, and write "Not determined" rather than guessing:

1. **Purpose**: what this area does for the product and who or what depends on it.
2. **Map**: the important folders and files, with one line each on what lives there. Name the entry points (mains, routes, handlers, jobs, public APIs).
3. **How it works**: the main flows through the code, end to end, with file references (path and symbol) a newcomer can follow.
4. **Data**: the models, schemas, tables, queues, caches and files this area owns or touches.
5. **Interfaces**: what it exposes to other areas and what it calls in them and in external services.
6. **Languages, frameworks and versions**: including anything old, unusual or in-house. Where the technology was unfamiliar, say what you looked up and link the source.
7. **Build, run and test**: the exact commands that work for this area, and which you actually ran.
8. **Conventions**: naming, structure, error handling, logging, patterns a change here must follow, with an example file for each.
9. **Danger zones**: fragile code, hidden coupling, generated files, performance-sensitive paths, things that look wrong but are intentional.
10. **Where to change what**: for the most likely kinds of change, which files to touch.
11. **Not covered**: what you did not read, and any sub-area large enough to deserve its own survey.`;

export async function survey(run) {
  const { state, modes, options } = run;
  if (modes.survey === 'never') return;

  const docsPrefix = run.docsDir === 'docs' ? run.doc('knowledge') : run.docsDir;
  const inventory = await takeInventory(run.projectDir, { ignore: [docsPrefix] });
  const existing = state.data.existing ?? isExistingCodebase(inventory);
  if (!existing && modes.survey !== 'always') return;
  if (!inventory.codeFiles) {
    info('Nothing to survey: the folder has no source code yet.');
    return;
  }

  const metaFile = run.abs(run.doc('knowledge/.meta.json'));
  const meta = readJson(metaFile, null);
  let refresh = null;
  if (state.get('survey.mode')) {
    refresh = state.get('survey.refresh', null); // resumed run: keep the decision made at the start
  } else {
    if (meta && modes.survey !== 'always' && (await commitExists(run.projectDir, meta.commit))) {
      const changed = (await changedFilesSince(run.projectDir, meta.commit)).filter((f) => !f.startsWith(run.docsDir + '/') && !f.startsWith('.harness/'));
      if (!changed.length) {
        info('The codebase map is current; no survey needed.');
        return;
      }
      refresh = { since: meta.commit, changed: changed.slice(0, 600), total: changed.length };
    }
    state.set('survey.refresh', refresh);
    state.set('survey.mode', refresh ? 'refresh' : 'full');
  }

  const K = (rel) => run.doc(`knowledge/${rel}`);
  writeText(run.abs(K('inventory.md')), renderInventory(inventory));
  writeJson(run.abs(K('inventory.json')), inventory);
  info(
    `Surveying the codebase: ${inventory.codeFiles.toLocaleString('en-US')} source files, about ${inventory.estimatedLines.toLocaleString('en-US')} lines` +
      (refresh ? ` (refresh: ${refresh.total} files changed since the last map)` : ''),
  );

  const timeoutMin = options.surveyTimeoutMin;
  const areasFile = run.abs(K('areas.json'));

  // 1. The principal engineer divides the codebase.
  await run.work({
    id: 'survey.plan',
    role: 'principal-engineer',
    title: refresh ? 'Plan the refresh of the codebase map' : 'Divide the codebase into areas to survey',
    timeoutMin,
    skipKnowledge: true,
    task: refresh
      ? `The team already has a map of this codebase in ${K('')}, built at commit ${refresh.since}. ${refresh.total} files have changed since. Read ${K('INDEX.md')} and the list of changed files below, and decide which areas need to be surveyed again and whether any new area has appeared.

Write ${K('areas.json')}: a JSON array containing only the areas to re-survey (an empty array if the existing map still holds), each \`{ "id", "name", "paths": [...], "depth": "deep" | "overview", "focus": "what to find out" }\`. Reuse the existing area ids where the area already exists.

Changed files${refresh.total > refresh.changed.length ? ` (first ${refresh.changed.length} of ${refresh.total})` : ''}:
${refresh.changed.map((f) => `- ${f}`).join('\n')}`
      : `Before anyone plans or builds, the team must understand this existing product. Start from the census in ${K('inventory.md')}, then explore the repository yourself: the top-level layout, build manifests, READMEs and existing documentation, and enough of each major folder to understand what it is.

Divide the codebase into at most ${options.maxAreas} areas that a staff engineer can each survey independently. Cut along real boundaries (services, applications, layers, bounded contexts, shared libraries, infrastructure), not alphabetically. Every substantial part of the repository must belong to an area. Mark an area "deep" when the owner's request is likely to touch it or everything depends on it, and "overview" when the team only needs to know what it is and where its boundary lies. For a very large repository, prefer more depth where the request lands and honest overviews elsewhere over shallow coverage of everything.

Write two files:
- ${K('areas.json')}: a JSON array of \`{ "id", "name", "paths": [folders or globs], "depth": "deep" | "overview", "focus": "the questions the surveyor must answer" }\`. Ids are lowercase with dashes.
- ${K('system-overview.md')}: your first reading of the system as a whole: what the product is, its major parts and how they relate, the technology stack and its age, and what you could not yet tell.

Where a language, framework or build system is unfamiliar or obsolete, look it up on the web before describing it.`,
    readFirst: [K('inventory.md')],
    deliver: refresh ? [K('areas.json')] : [K('areas.json'), K('system-overview.md')],
  });

  const loadAreas = (file, allowEmpty) => {
    const areas = readJson(file, null);
    if (areas === null) throw new HarnessError(`The principal engineer did not write ${path.relative(run.projectDir, file)}`);
    const problems = validateAreas(areas, { allowEmpty });
    if (problems.length) throw new HarnessError(`${path.relative(run.projectDir, file)} is invalid: ${problems.join('; ')}`);
    return areas.slice(0, options.maxAreas);
  };

  let areas = state.get('survey.areas.r1') ?? loadAreas(areasFile, Boolean(refresh));
  state.set('survey.areas.r1', areas);

  // 2. Deployment, testing and security are mapped once, alongside the first round of areas.
  const crossCutting = refresh
    ? []
    : [
        () =>
          run.work({
            id: 'survey.deployment',
            role: 'platform-engineer',
            title: 'Map how the product is built, configured and deployed',
            timeoutMin,
            skipKnowledge: true,
            task: `Work out, from the repository, how this existing product gets from source to production, and write it down so nobody on the team has to rediscover it.

Cover: where it is deployed (clouds, platforms, regions, clusters) and the evidence for each claim; environments and how they differ; the CI/CD pipelines stage by stage; how it is built and packaged (containers, artefacts, versions); infrastructure as code and what it manages; runtime configuration and where each setting comes from; how secrets are supplied (names and mechanisms only, never values); databases and other managed services and how schema changes are applied; observability (logs, metrics, traces, alerts); release, rollback and feature-flag practice; and what a new change must do to ship safely.

You are reading, not changing: do not run anything that touches real infrastructure, and do not print secret values. Where the repository does not say, write "Not determined from the repository" and list it as a question for the owner. Look up any deployment technology you do not know.`,
            readFirst: [K('inventory.md'), K('system-overview.md')],
            deliver: [K('deployment.md')],
          }),
        () =>
          run.work({
            id: 'survey.testing',
            role: 'principal-qa',
            title: 'Map how the product is tested',
            timeoutMin,
            skipKnowledge: true,
            task: `Work out how quality is assured in this existing product today and write it down for the team.

Cover: the test suites that exist, by level and by area, and roughly how much each protects; the exact commands to run them, and which you ran and what happened; test data, fixtures and environments; what CI runs and what gates a merge; the main user-facing flows of the product as far as you can reconstruct them from routes, screens and tests; areas with little or no protection where a change is risky; flaky or disabled tests; and how a new feature should be tested here to match existing practice.`,
            readFirst: [K('inventory.md'), K('system-overview.md')],
            deliver: [K('testing.md')],
          }),
        () =>
          run.work({
            id: 'survey.security',
            role: 'security-engineer',
            title: 'Map the security model of the product',
            timeoutMin,
            skipKnowledge: true,
            task: `Establish the security baseline of this existing product so later changes can be judged against it. This is a map, not a full audit.

Cover: how users and services authenticate; how authorisation is decided and where it is enforced; trust boundaries and the entry points that cross them; where sensitive data lives and how it is protected; how secrets are handled (mechanisms and names only, never values); dependency and supply-chain posture; existing security tooling in CI; and the conventions a change must follow to stay inside the model. Record obvious weaknesses you notice as findings with their location, but do not go hunting yet.`,
            readFirst: [K('inventory.md'), K('system-overview.md')],
            deliver: [K('security-baseline.md')],
          }),
      ];

  // 3. Staff engineers survey the areas in parallel; the principal synthesises; repeat while gaps remain.
  for (let round = 1; round <= options.surveyRounds; round++) {
    if (!areas.length && round === 1) info('The principal engineer found no area that needs re-surveying.');
    await run.all([
      ...areas.map((area) => () =>
        run.work({
          id: `survey.r${round}.area.${area.id}`,
          role: 'staff-engineer',
          title: `Survey area: ${area.name}`,
          timeoutMin,
          skipKnowledge: true,
          task: `You own the survey of one area of an existing codebase. Other staff engineers are surveying the other areas at the same time; stay inside yours, but record every point where it meets another.

Area: ${area.name}
Paths: ${area.paths.join(', ')}
Depth: ${area.depth === 'overview' ? 'overview (what it is, its boundary and interfaces, how to build and test it; do not trace every flow)' : 'deep (a newcomer should be able to make a correct change here using only your document)'}
Find out: ${area.focus || 'everything a teammate needs to work here safely'}

Read the code, not just its names. Start from entry points and follow the real flows. Run the build and tests for this area if you can do so safely and locally, and record what happened. When you meet a language, framework, protocol or tool you do not know well, especially an old one, stop and research it on the web until you can explain how it is used here, and cite what you read. Take the time the area needs; a wrong map is worse than a slow one. You may use subagents to read large subtrees in parallel, but you are responsible for checking what they report.

Do not change product code. Write only your knowledge document.

${AREA_TEMPLATE}`,
          readFirst: [K('system-overview.md'), K('inventory.md')].filter((p) => fs.existsSync(run.abs(p))),
          deliver: [K(`areas/${area.id}.md`)],
        }),
      ),
      ...(round === 1 ? crossCutting : []),
    ]);

    const nextFile = run.abs(K('areas-next.json'));
    fs.rmSync(nextFile, { force: true });
    await run.work({
      id: `survey.synthesis.r${round}`,
      role: 'principal-engineer',
      title: 'Assemble the codebase knowledge base',
      timeoutMin,
      skipKnowledge: true,
      resumeFrom: 'survey.plan',
      task: `The surveys are in. Read every document under ${K('areas/')} together with ${K('deployment.md')}, ${K('testing.md')} and ${K('security-baseline.md')} where they exist, check the claims that matter against the code, and resolve contradictions between surveyors by reading the code yourself.

Then write or update:
- ${K('CODEBASE.md')}: the system map. What the product is; the architecture as it really is (with a diagram in text); every area with a paragraph and a link to its document; how a request or job flows across areas; shared data and cross-cutting mechanisms (auth, configuration, logging, errors, feature flags); how to build, run and test the whole thing; the technology stack with versions and age; a glossary of the product's own terms; the known risk zones; and open questions for the owner.
- ${K('INDEX.md')}: the page every teammate reads first, kept under 200 lines. A five-line description of the product, a table "if you need to change X, read Y" that routes to the right area documents, the handful of rules everyone must follow in this codebase, and the essential commands.

Finally, judge whether the map is good enough to plan the owner's request safely. If an area was too large or a part the request depends on is still not understood${round < options.surveyRounds ? `, write ${K('areas-next.json')} in the same format as areas.json listing what must be surveyed in another round (new, narrower areas). If nothing more is needed, do not create that file.` : ', say exactly what remains unknown in CODEBASE.md under open questions; there is no further survey round.'}`,
      readFirst: [K('system-overview.md'), K('areas.json')],
      deliver: [K('CODEBASE.md'), K('INDEX.md')],
    });
    await run.commit(`codebase survey, round ${round}`);

    if (round >= options.surveyRounds || !fs.existsSync(nextFile)) break;
    areas = state.get(`survey.areas.r${round + 1}`) ?? loadAreas(nextFile, true);
    state.set(`survey.areas.r${round + 1}`, areas);
    fs.renameSync(nextFile, run.abs(K(`areas-round-${round + 1}.json`)));
    if (!areas.length) break;
    info(`The principal engineer asked for another survey round: ${areas.map((a) => a.name).join(', ')}`);
  }

  if (!run.hasKnowledge()) {
    throw new HarnessError(`The survey finished without ${K('INDEX.md')}. See the transcript of the synthesis step.`);
  }

  // 4. Brief the boss. The boss can send the engineers back before any planning starts.
  await run.reviewLoop('survey', {
    title: 'Codebase briefing',
    artifacts: [K('INDEX.md'), K('CODEBASE.md'), K('deployment.md'), K('testing.md'), K('security-baseline.md')].filter((p) => fs.existsSync(run.abs(p))),
    guidance: `The engineers have surveyed the existing product and this is their briefing to you. Read it as the person who must now decide what to build in this codebase. Approve when you understand the product, how it is built and deployed, and where the owner's request will land, well enough to plan it. Send it back when something you need for that decision is missing, contradictory or asserted without evidence: name the role (staff-engineer for an area, principal-engineer for the overall map, platform-engineer for deployment, principal-qa for testing, security-engineer for security) and say exactly what must be found out. Put questions only the owner can answer in note_to_owner.`,
  });

  const commit = await head(run.projectDir);
  writeJson(metaFile, { commit, surveyed: new Date().toISOString(), run: state.id, areas: (state.get('survey.areas.r1') ?? []).map((a) => a.id) });
  await run.commit('codebase map recorded');
  memory.remember('project', `A map of this codebase is kept in ${K('')}; INDEX.md is the entry point and CODEBASE.md the full system map.`, {
    projectDir: run.projectDir,
    run: state.id,
    source: 'harness',
  });
  if (!refresh && inventory.estimatedLines > 5_000_000) {
    warn('This is a very large codebase: the map is deep where the request lands and an overview elsewhere. Run "harness survey" again with a different request to deepen other areas.');
  }
}
