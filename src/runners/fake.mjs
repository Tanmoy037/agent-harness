import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Stand-in agents for testing the harness itself (HARNESS_FAKE_AGENTS=1).
 *
 * No model is called. Each step writes the files it was asked to deliver and returns a
 * well-formed result, with a fixed script of events that exercises the loops: one director
 * revision, one code-review rejection, one merge conflict, one verification failure.
 * It proves the orchestration (state, git, worktrees, gates, resume, memory); it says
 * nothing about the quality of real agents' work.
 */

const once = new Set();
const firstTime = (key) => (once.has(key) ? false : (once.add(key), true));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const TASKS = [
  { id: 'scaffold', title: 'Project scaffold', description: 'Set up the project.', acceptance: 'Builds.', depends_on: [], owner: 'senior-engineer' },
  { id: 'feature-a', title: 'Feature A', description: 'Build A.', acceptance: 'A works.', depends_on: ['scaffold'], owner: 'senior-engineer' },
  { id: 'feature-b', title: 'Feature B', description: 'Build B.', acceptance: 'B works.', depends_on: ['scaffold'], owner: 'senior-engineer' },
];

function deliver(spec, projectDir) {
  const written = [];
  for (const entry of spec.deliver ?? []) {
    const rel = entry.split(' ')[0];
    const abs = path.isAbsolute(rel) ? rel : path.join(projectDir, rel);
    if (rel.endsWith('/')) {
      write(path.join(abs, 'README.md'), `# ${spec.title}\n\nFake output for ${spec.id}.\n`);
    } else if (rel.endsWith('areas.json')) {
      write(abs, JSON.stringify([
        { id: 'core', name: 'Core', paths: ['src/'], depth: 'deep', focus: 'Everything' },
        { id: 'web', name: 'Web', paths: ['web/'], depth: 'overview', focus: 'Boundary' },
      ], null, 2));
    } else if (rel.endsWith('tasks.json')) {
      write(abs, JSON.stringify(TASKS, null, 2));
    } else if (rel.endsWith('.json')) {
      write(abs, '{}\n');
    } else {
      write(abs, `# ${spec.title}\n\nFake output for step \`${spec.id}\` by ${spec.role}.\n`);
    }
    written.push(rel);
  }
  return written;
}

function decision(spec) {
  const name = spec.schemaName;
  const id = spec.id;
  switch (name) {
    case 'intake':
      return /\.r1$/.test(id)
        ? { understanding: 'A small test product.', ready: false, questions: [{ id: 'q1', question: 'Who is it for?', why: 'Scope', options: [] }], assumptions: [] }
        : { understanding: 'Understood.', ready: true, questions: [], assumptions: ['Assumed a general audience.'] };
    case 'review':
      // The director sends the architecture back once, to exercise the revision loop.
      if (/^architecture\.review\.r1$/.test(id)) {
        return { verdict: 'revise', summary: 'Plan misses rollback.', revisions: [{ role: 'platform-engineer', instructions: 'Add a rollback procedure to the deployment plan.' }], risks: [], note_to_owner: '' };
      }
      return { verdict: 'approve', summary: 'Approved.', revisions: [], risks: [], note_to_owner: 'Looks right.' };
    case 'design_choice':
      return { choice: 'Direction A', reasoning: 'Fits the users.', changes_requested: '' };
    case 'code_review':
      if (/\.review\.feature-a\.r1$/.test(id)) {
        return { verdict: 'changes', summary: 'Missing a test.', required_changes: ['Add a test for the empty case.'], lessons: [{ scope: 'role', lesson: 'Write the empty-state test before requesting review.' }] };
      }
      return { verdict: 'approve', summary: 'Good.', required_changes: [], lessons: [] };
    case 'triage':
      if (/^verify\.r1\.triage$/.test(id)) {
        return { verdict: 'fix', summary: 'One major defect.', fix_tasks: [{ id: 'empty-state', title: 'Fix empty state', description: 'The list crashes when empty.', acceptance: 'Empty list renders.', owner: 'senior-engineer' }], deferred: [] };
      }
      return { verdict: 'accept', summary: 'All must-haves pass.', fix_tasks: [], deferred: ['Dark mode'] };
    case 'answers':
      return { answers: [{ question: 'any', answer: 'Decide yourself.' }], ask_owner: [] };
    case 'release_decision':
      return { verdict: 'go', summary: 'Ready.', conditions: [] };
    case 'retrospective':
      return {
        summary: 'A clean test run.',
        role_lessons: [{ role: 'senior-engineer', lesson: 'When a list can be empty, build and test the empty state in the same task as the list.', evidence: 'verify.r1' }],
        team_lessons: ['Deployment plans must include rollback before the director reviews them.'],
        owner_preferences: [],
        project_facts: ['The product is a test fixture.'],
        retire_lesson_ids: [],
        skill_proposals: [],
      };
    default:
      throw new Error(`fake agent: no canned decision for schema "${name}" (step ${id})`);
  }
}

export async function runFake({ spec, role, cwd, projectDir }) {
  await new Promise((r) => setTimeout(r, 15));
  if (spec.kind === 'decision') {
    return { ok: true, structured: decision(spec), sessionId: `fake-${spec.id}`, costUsd: 0, text: '' };
  }

  const outputs = deliver(spec, projectDir);
  const findings = [];

  // Build and fix tasks write code in their worktree. Two parallel tasks touch the same
  // file so that the second merge conflicts.
  const task = spec.id.match(/^(build|fix\d+)\.task\.(.+)$/);
  if (task) {
    write(path.join(cwd, 'src', `${task[2]}.js`), `export const name = '${task[2]}';\n`);
    if (task[2] === 'scaffold') write(path.join(cwd, 'shared.txt'), 'base\n');
    if (task[2] === 'feature-a' || task[2] === 'feature-b') write(path.join(cwd, 'shared.txt'), `base\n${task[2]}\n`);
    outputs.push(`src/${task[2]}.js`);
  }
  if (/\.merge\./.test(spec.id)) {
    write(path.join(cwd, 'shared.txt'), 'base\nfeature-a\nfeature-b\n');
    execFileSync('git', ['add', '-A'], { cwd });
  }
  if (/^verify\.r1\.staff-qa$/.test(spec.id)) {
    findings.push({ severity: 'major', title: 'List crashes when empty', details: 'Open the list with no items.', location: 'src/feature-a.js', owner: 'senior-engineer' });
  }

  // One step asks a question, to exercise the question-and-answer loop.
  if (spec.id === 'architecture.design' && firstTime('ask')) {
    return {
      ok: true,
      sessionId: `fake-${spec.id}`,
      costUsd: 0,
      structured: { status: 'needs_input', summary: 'Need a decision.', outputs: [], verification: '', questions: ['Single region or multi-region?'], findings: [], lessons: [], handoff: '' },
    };
  }

  return {
    ok: true,
    sessionId: `fake-${spec.id}`,
    costUsd: 0,
    structured: {
      status: 'done',
      summary: `Fake ${role.id} finished "${spec.title}".`,
      outputs,
      verification: 'Fake agent: nothing was verified.',
      questions: [],
      findings,
      lessons: [],
      handoff: '',
    },
  };
}
