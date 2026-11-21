---
name: task-breakdown
description: Use when turning an architecture and design into the implementation plan and the tasks.json file that several engineers will build in parallel git worktrees, or when revising that file after review. Covers the exact file format the harness validates, foundations first, fixing interfaces, keeping parallel tasks file-disjoint, sizing, acceptance criteria and the coverage check.
---

# Task breakdown

The task file is executed mechanically. The harness starts every task whose dependencies are merged, up to the number of parallel engineers, each in its own worktree on its own branch. Each finished task is reviewed and merged into the shared branch. Two things therefore decide whether the build goes well: whether tasks that run together can merge without colliding, and whether each engineer has everything needed without asking. The breakdown is where both are settled.

## The file

`engineering/tasks.json` in the Team documents folder is a JSON array. The harness rejects the file if any rule is broken.

| Field | Rule |
|---|---|
| `id` | Required. Lowercase letters, digits and dashes, starting with a letter or digit, at most 41 characters. Unique. It becomes part of a branch name. |
| `title` | Required, non-empty string. |
| `description` | Required, non-empty string. Everything the engineer needs. |
| `acceptance` | Required, non-empty string. Checkable criteria. |
| `depends_on` | Array of existing task ids. No cycles. Use `[]` when there are none. |
| `files` | Array of the main paths the task creates or changes. |
| `owner` | `senior-engineer`, or another building role when the work is theirs (`platform-engineer`, `staff-designer`). |

Check the file before you report: `node -e "const t=require('./<path>/tasks.json'); console.log(t.length, new Set(t.map(x=>x.id)).size)"` must print the same number twice, and every `depends_on` entry must be an id in the file.

## Procedure

### 1. List what must exist

Before thinking about tasks, write the inventory of everything the plan must deliver, each with an identifier you can trace later: every must-have story and acceptance criterion in the PRD, every screen in the screen specification, every numbered security requirement in the threat model, every quality gate in the test strategy, and what the deployment plan needs from the codebase (health checks, configuration, migrations). This list is the input to the coverage check in step 8.

### 2. Put foundations first

Foundations are what more than one task needs in order to start: the project scaffold and tooling, lint and test setup, design tokens and base styles, the data schema, shared types and contracts, the authentication skeleton, the app shell and routing. Put them in one or two tasks with no dependencies and make everything else depend on them.

Keep foundations real but minimal. A foundation task that tries to anticipate every later need becomes the bottleneck that everything waits for and then needs changing anyway.

### 3. Fix the interfaces before you split

Parallel work fits together only if the seams are decided in advance. In the implementation plan, write each interface between tasks precisely: endpoint paths with request and response shapes, function and component signatures, table definitions, event names and payloads, file locations. Then every task description states which interface it implements and which it consumes, quoting or pointing to the exact section.

With the contract fixed, the two sides of a seam can be built at the same time: the consumer builds against the contract with a stub, the provider builds to the same contract with tests. Add a later task that wires them together and tests the pair when the risk justifies it.

### 4. Slice by behaviour

Prefer a task that delivers one behaviour through all the layers it needs (schema, logic, interface, tests) over tasks cut by layer. A vertical task can be tested by itself and leaves the product working when merged. Cut by layer only for the shared foundations.

### 5. Make parallel tasks file-disjoint

Two tasks that may run at the same time must not edit the same files, because the second to merge will conflict.

1. Fill in `files` for every task.
2. For every pair of tasks with no dependency path between them, check that the lists do not overlap.
3. Deal with the usual collision points: route tables, navigation menus, schema index files, barrel or index exports, dependency manifests, translation files, global styles, dependency-injection registries. Either have the foundation task create the entries for everything in advance, or structure registration by convention (one file per route, one migration file per task), or order the tasks with `depends_on`.

A dependency added only to avoid a collision is legitimate. Say so in the description so nobody removes it.

### 6. Size each task

A well-sized task is one coherent piece of work for one engineer in one session, which leaves the product building and all tests passing when merged.

- Split when the description joins unrelated behaviours with "and", when the task spans several areas of the codebase, or when its acceptance list covers more than a handful of distinct behaviours.
- Merge when a piece cannot be tested by itself, or when one task only makes sense once another exists and nobody else needs the first.
- Tests belong to the task that builds the behaviour. A "write the tests" task at the end means untested code is merged for the whole build.

More small independent tasks is usually better than a few large ones, because review is sharper and a failure costs less. Do not split something that only makes sense whole.

### 7. Write descriptions and acceptance criteria

The engineer starts in a fresh worktree knowing only the team documents and your description. Use this shape:

```
What: the behaviour to build, in two or three sentences.
Where: the folders and files, and the existing code to extend.
Contract: the interface this task implements (section reference) and those it consumes.
Pattern: the convention or existing example to follow.
Read first: exact sections of the architecture, design, PRD; for an existing product, the knowledge documents and files.
Out of scope: what neighbouring tasks own, by task id.
```

Acceptance criteria are statements a reviewer can check by running something: the PRD acceptance criteria this task satisfies, by number; the tests that must exist, by name or behaviour, and pass; the commands that must succeed (build, lint, types, the full test suite); and, for UI, the screens that must match the prototype at phone and desktop widths. "Works correctly" is not a criterion.

### 8. Check coverage

Build a table from the inventory in step 1 to task ids. Every row must have at least one task. Rows with none are missing tasks; tasks that appear in no row are work nobody asked for, so remove them or justify them. Put the table in the implementation plan, because the boss reviews the plan for exactly this.

### 9. Check the graph

Dependencies must be real: a task depends on another only if it needs its merged output or would collide with it. Unnecessary dependencies turn a parallel build into a queue. Look at the result: after the foundations, the number of tasks that can run at once should be at least the number of engineers for most of the build. A long chain means an interface was not fixed or a task was cut by layer.

## Worked example

Feature: team invitations in an existing web app. Contracts for the `invitations` table, `POST /api/invitations`, `POST /api/invitations/accept` and the `InviteForm` props are written in the implementation plan, section 3.

```json
[
  { "id": "invite-schema", "title": "Invitations table and model",
    "description": "What: add the invitations table and its model. Where: db/migrations/, src/models/invitation.ts. Contract: implements plan 3.1 exactly (columns, unique index on team_id+email, expiry). Pattern: follow src/models/membership.ts. Out of scope: any endpoint.",
    "acceptance": "Migration applies and rolls back cleanly. Model tests cover create, duplicate rejection and expiry. Build, lint and full test suite pass.",
    "depends_on": [], "files": ["db/migrations/0042_invitations.sql", "src/models/invitation.ts", "test/models/invitation.test.ts"], "owner": "senior-engineer" },
  { "id": "invite-api", "title": "Create and accept invitation endpoints",
    "description": "What: POST /api/invitations and POST /api/invitations/accept. Contract: plan 3.2 and 3.3. Only team admins may invite (security requirement SR-7); tokens are single use (SR-8). Pattern: src/api/memberships.ts. Out of scope: email sending (invite-email), UI (invite-ui).",
    "acceptance": "Satisfies PRD AC 4.1, 4.2, 4.5. Tests cover non-admin rejection, expired and reused token, duplicate invite. Full suite passes.",
    "depends_on": ["invite-schema"], "files": ["src/api/invitations.ts", "test/api/invitations.test.ts"], "owner": "senior-engineer" },
  { "id": "invite-email", "title": "Invitation email",
    "description": "What: template and send function called by the create endpoint through the mailer interface in plan 3.4. Pattern: src/mail/password-reset.ts. Build against the interface; do not edit src/api/invitations.ts.",
    "acceptance": "Satisfies PRD AC 4.3. Rendering test with long team names. Full suite passes.",
    "depends_on": ["invite-schema"], "files": ["src/mail/invitation.ts", "src/mail/templates/invitation.html", "test/mail/invitation.test.ts"], "owner": "senior-engineer" },
  { "id": "invite-ui", "title": "Invite form and pending list on team settings",
    "description": "What: InviteForm and PendingInvites on the team settings screen (screens.md, Team settings). Contract: consumes plan 3.2 using a stubbed client until invite-api merges. All states in the specification: empty, loading, validation error, sent.",
    "acceptance": "Matches prototype team-settings.html at 390 and 1280 px. Satisfies PRD AC 4.1, 4.4. Component tests for each state. Full suite passes.",
    "depends_on": ["invite-schema"], "files": ["src/ui/team/InviteForm.tsx", "src/ui/team/PendingInvites.tsx", "test/ui/team/invite.test.tsx"], "owner": "senior-engineer" },
  { "id": "invite-e2e", "title": "Wire invitations end to end",
    "description": "What: remove the stub, register the route in the settings navigation, add the end-to-end test for invite, receive, accept. Depends on all three for the wiring and to avoid colliding on the navigation file.",
    "acceptance": "End-to-end test passes for the journey in product-flows F-06 including the expired-link path. Full suite passes.",
    "depends_on": ["invite-api", "invite-email", "invite-ui"], "files": ["src/ui/settings/nav.ts", "e2e/invitations.spec.ts"], "owner": "senior-engineer" }
]
```

After the schema task, three tasks run at once on disjoint files; the last one owns the only shared file.

## Existing products

Add to each description the knowledge documents and existing files to read first, and name the existing example to imitate. Where a task changes untested legacy code, its acceptance criteria include characterisation tests written before the change.

## Faults reviewers will send back

- A task whose description is a topic ("authentication") rather than a behaviour and an interface.
- Two parallel tasks listing the same file.
- Acceptance criteria that cannot be run.
- A PRD must-have, screen or security requirement with no task.
- Tests, accessibility or error states deferred to a final task.
- A dependency chain where a fixed contract would have allowed parallel work.
