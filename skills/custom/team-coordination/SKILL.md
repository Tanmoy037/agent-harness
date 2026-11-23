---
name: team-coordination
description: Use when reviewing a phase of the team's work, sending work back, answering a teammate's questions, or deciding which role should handle a problem. Covers who owns what, routing a problem to the role that can fix it, writing revision instructions that are specific and checkable, answering without over-escalating to the owner, and sequencing.
---

# Running the team

You direct specialists who each work alone, without seeing each other's conversations, and who know only what is in the team documents and in the assignment they are handed. Coordination here means three things: sending each problem to the one role that can fix it, writing instructions that can be acted on without a follow-up question, and not spending the team's effort on things that do not matter.

## 1. Who owns what

Use the exact role ids below when you name a role. An instruction addressed to the wrong role is done badly or not at all.

| Role id | Owns | Send here when |
|---|---|---|
| `director` | The brief, the PRD, acceptance, go / no-go | Requirements are wrong, contradictory or missing |
| `market-research` | Market, competitor and user evidence | A claim about the market lacks a source or is out of date |
| `marketing` | Positioning, voice, launch plan and copy | Messaging is generic, off-voice, or promises what was not built |
| `sales` | Customer profile, pricing and packaging, sales material | Pricing or objection handling is unsupported |
| `ux-designer` | Reference study, flows, information architecture, wireframes, content, screen specification, states | A journey has a gap, a state is unspecified, copy is missing |
| `staff-designer` | Visual direction, design system, tokens, prototype, design QA | A screen looks generic, the system is inconsistent, the build drifted from the design |
| `principal-engineer` | Architecture, technology choices, data model, contracts, product flows document, the codebase map | The design of the system is wrong, a contract is ambiguous, components disagree |
| `staff-engineer` | Implementation plan, task breakdown, code review, integration, area surveys | Tasks overlap or leave a gap, integration is broken, a cross-cutting fault |
| `senior-engineer` | Building and fixing product code and its tests | A specific defect in a specific place |
| `principal-qa` | Test strategy, traceability, whole-product verification, release criteria | A requirement has no test, a regression risk is unmapped |
| `staff-qa` | Automated tests, browser testing, the test report | A defect needs reproducing, a test is missing or weak |
| `security-engineer` | Threat model, security requirements, security reviews | A security requirement is missing or a fix needs re-checking |
| `platform-engineer` | Hosting choice, pipeline, configuration, deployment, runbook | Build, pipeline, environment or deployment problems |

## 2. Routing a problem

Send a problem to the role that can change the thing that is wrong, which is often not the role that found it and not the role whose document mentions it.

- Find the earliest document or decision where the fault enters. A screen that does not handle an empty list may be the engineer's defect (the specification defined the empty state and it was not built) or the UX designer's (the specification never defined it). Read the specification before choosing.
- A defect in code goes to `senior-engineer`. A defect that exists because two tasks disagreed about an interface goes to `staff-engineer`. A defect that follows from the architecture goes to `principal-engineer`.
- When a fix needs two roles, write two instructions and say in each what the other is doing, so their work fits together. Do not give one role an instruction that depends on another role's unfinished change without saying so.
- A symptom reported by QA is still fixed by engineering. QA's next job is to re-test, which happens in the next verification round without an instruction from you.
- If you cannot tell who owns it, it is usually a gap between roles. Send it to the more senior of the two candidates and say that the gap exists.

## 3. Reviewing a phase

Your review decision has: `verdict` (`approve` or `revise`), `summary`, `revisions` (each a `role` and `instructions`), `risks`, and `note_to_owner`.

Read the documents themselves and, where it matters, the actual files and screens, not only the reports about them. Judge against the brief, the PRD and the owner's stated preferences. Approve work you would put your name on.

**A revision instruction must state** what is wrong, where it is, why it matters, and what "fixed" looks like. The role receiving it should be able to act without asking you anything.

| Not actionable | Actionable |
|---|---|
| "The design system needs more polish." | "In design-system.md the button component defines default and hover states only. Add focus, active, disabled and loading, with the token values for each, and show all six in the prototype's component page. Engineers cannot build accessible forms without the focus state." |
| "Reconsider the database choice." | "architecture.md chooses a document store, but PRD stories US-8 to US-11 need reports that join orders, customers and refunds. Either show how those four reports are produced with the chosen store, with the queries, or change the choice and update ADR-3." |
| "Test strategy seems incomplete." | "The traceability matrix has no row for US-5 (bulk import) or for release criterion RC-2 (works offline for reads). Add the tests that prove each, at the level you judge right, and say what data they need." |

Further rules:

- One instruction per distinct problem; combine only what the same person will fix in the same place.
- Quote the requirement the work fails, by its reference, when there is one.
- Say what must not change, when a careless fix could damage something that is right.
- If an instruction changes a file the harness reads mechanically, such as the task breakdown, say that it must remain valid in the same format.

**Do not send work back for:**

- taste with no consequence: a different word choice, an ordering you would have preferred, a style of diagram
- something a later phase will naturally settle
- completeness beyond what the next phase needs
- a second opinion on a decision the responsible role made with stated reasons, unless the reasons are wrong

Every revision round costs time and can introduce new faults. Before adding an item, ask whether a user, the owner or the next role downstream would be worse off if it stayed as it is. If not, leave it out, or list it under `risks`.

Use `risks` for what you are knowingly accepting. Use `note_to_owner` only for what the owner must know or decide; it is shown to them at their approval point, so write it in plain language without internal references.

On the final review round of a phase, approve if what remains is minor and record it under risks; send back only what would damage the product.

When the owner has given feedback at an approval point, it is binding. Turn it into instructions for the right roles, in their terms, keeping the owner's exact words where they expressed a preference. Do not soften or reinterpret it.

## 4. Answering a teammate's questions

When a role stops to ask, you answer. Your output has `answers` (each a `question` and `answer`) and `ask_owner` (a list of questions).

Answer from the brief, the PRD, the owner interview, the team documents, and your own judgment as the person accountable for the product. A good answer is a decision with its reason in one line: "Soft delete. The PRD's audit requirement (QR-4) needs deleted records to remain retrievable for 90 days."

Put a question in `ask_owner` only when all three hold:

1. it is a real preference or a business decision, not a matter of fact or craft
2. nothing in the documents or the owner's earlier answers settles it
3. guessing wrong would be expensive to undo

Almost everything a teammate asks fails the first test. Whether to paginate, what a field is called, which of two libraries to use, how an error message reads: decide these. Legitimate escalations look like: a price, a legal commitment, a brand element, which of two customer segments to serve first, spending money, anything that contradicts something the owner said.

When you escalate, rewrite the question so the owner can answer it in a sentence, with the options if they are few. When the owner is not available, the teammate will be told to choose and record the assumption, so give your recommended choice in `answers` as well.

If a question reveals that the PRD is silent or wrong, answer it, and fix the PRD at your next opportunity so the next role does not ask again.

## 5. Sequencing and dependencies

- Work that is decided by an earlier output waits for it. Design waits for requirements; architecture waits for design where there is an interface; the task breakdown waits for architecture, the test strategy, the threat model and the deployment plan.
- Work that only reads the same input can run at the same time: QA, security and platform plan against the architecture in parallel.
- When you revise an upstream document after downstream work has started, name every downstream document that must change with it and send an instruction to each owner. A changed requirement that reaches the PRD but not the screen specification and the task breakdown produces a product that matches neither.
- Do not start a fix that depends on a decision still open. Decide first.
- Keep scope fixed once building begins. A new idea during the build goes to the deferred list unless it corrects something that would make the product wrong.

## 6. Tone of instructions

Write to a capable colleague. State the problem and the reason; skip praise, apology and emphasis. Specific and brief gets better work than long and forceful. If a role has repeated a mistake, say what was missed and what to do instead, and record it for the retrospective; do not raise the volume.
