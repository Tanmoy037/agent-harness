/**
 * Output contracts between agents and the harness.
 *
 * Written in the strict subset both CLIs accept: every property is required and every
 * object sets additionalProperties:false (Codex sends these as strict structured outputs).
 */

const str = { type: 'string' };
const strList = { type: 'array', items: str };
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const ROLE_IDS = [
  'boss',
  'market-research',
  'marketing',
  'sales',
  'staff-designer',
  'ux-designer',
  'principal-engineer',
  'staff-engineer',
  'senior-engineer',
  'principal-qa',
  'staff-qa',
  'security-engineer',
  'platform-engineer',
];

const roleEnum = { type: 'string', enum: ROLE_IDS };

const finding = obj({
  severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'note'] },
  title: str,
  details: str,
  location: str,
  owner: roleEnum,
});

const lesson = obj({
  scope: { type: 'string', enum: ['role', 'team', 'project'] },
  lesson: str,
});

/** What every working agent returns at the end of an assignment. */
export const WORK_REPORT = obj({
  status: { type: 'string', enum: ['done', 'needs_input', 'blocked'] },
  summary: str,
  outputs: strList,
  verification: str,
  questions: strList,
  findings: { type: 'array', items: finding },
  lessons: { type: 'array', items: lesson },
  handoff: str,
});

/** Boss: interview the owner before anything is built. */
export const INTAKE = obj({
  understanding: str,
  ready: { type: 'boolean' },
  questions: {
    type: 'array',
    items: obj({ id: str, question: str, why: str, options: strList }),
  },
  assumptions: strList,
});

/** Boss: review a phase and either approve it or send work back. */
export const REVIEW = obj({
  verdict: { type: 'string', enum: ['approve', 'revise'] },
  summary: str,
  revisions: { type: 'array', items: obj({ role: roleEnum, instructions: str }) },
  risks: strList,
  note_to_owner: str,
});

/** Boss: choose among the designers' directions when the owner is not the one choosing. */
export const DESIGN_CHOICE = obj({
  choice: str,
  reasoning: str,
  changes_requested: str,
});

/** Boss: decide what must be fixed before the product is accepted. */
export const TRIAGE = obj({
  verdict: { type: 'string', enum: ['accept', 'fix'] },
  summary: str,
  fix_tasks: {
    type: 'array',
    items: obj({ id: str, title: str, description: str, acceptance: str, owner: roleEnum }),
  },
  deferred: strList,
});

/** Boss: answer a teammate's questions, escalating only what the owner must decide. */
export const ANSWERS = obj({
  answers: { type: 'array', items: obj({ question: str, answer: str }) },
  ask_owner: strList,
});

/** Staff engineer: code review of one task branch. */
export const CODE_REVIEW = obj({
  verdict: { type: 'string', enum: ['approve', 'changes'] },
  summary: str,
  required_changes: strList,
  lessons: { type: 'array', items: lesson },
});

/** Boss: go / no-go for release. */
export const RELEASE_DECISION = obj({
  verdict: { type: 'string', enum: ['go', 'no-go'] },
  summary: str,
  conditions: strList,
});

/** Boss: what the team should learn from this run. */
export const RETROSPECTIVE = obj({
  summary: str,
  role_lessons: { type: 'array', items: obj({ role: roleEnum, lesson: str, evidence: str }) },
  team_lessons: strList,
  owner_preferences: strList,
  project_facts: strList,
  retire_lesson_ids: strList,
  skill_proposals: {
    type: 'array',
    items: obj({ role: roleEnum, name: str, description: str, body: str }),
  },
});

/** Shape of docs/engineering/tasks.json, written by the staff engineer and checked by the harness. */
export function validateTasks(tasks) {
  const problems = [];
  if (!Array.isArray(tasks) || tasks.length === 0) return ['tasks.json must be a non-empty array'];
  const ids = new Set();
  for (const [i, t] of tasks.entries()) {
    const where = `task ${i + 1}${t?.id ? ` (${t.id})` : ''}`;
    if (!t || typeof t !== 'object') {
      problems.push(`${where}: not an object`);
      continue;
    }
    for (const key of ['id', 'title', 'description', 'acceptance']) {
      if (typeof t[key] !== 'string' || !t[key].trim()) problems.push(`${where}: missing "${key}"`);
    }
    if (t.id && !/^[a-z0-9][a-z0-9-]{0,40}$/.test(t.id)) problems.push(`${where}: id must be lowercase letters, digits and dashes`);
    if (ids.has(t.id)) problems.push(`${where}: duplicate id`);
    ids.add(t.id);
    if (t.depends_on !== undefined && !Array.isArray(t.depends_on)) problems.push(`${where}: depends_on must be an array`);
  }
  for (const t of tasks) {
    for (const dep of t?.depends_on ?? []) {
      if (!ids.has(dep)) problems.push(`task ${t.id}: depends on unknown task "${dep}"`);
    }
  }
  if (!problems.length && hasCycle(tasks)) problems.push('task dependencies contain a cycle');
  return problems;
}

function hasCycle(tasks) {
  const deps = new Map(tasks.map((t) => [t.id, t.depends_on ?? []]));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    for (const d of deps.get(id) ?? []) if (visit(d)) return true;
    state.set(id, 'done');
    return false;
  };
  return tasks.some((t) => visit(t.id));
}
