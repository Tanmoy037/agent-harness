---
name: retrospective-lessons
description: Use when running the end-of-run retrospective to decide what the team should remember. Covers attributing a problem to the role that could have prevented it, the test of a good lesson, owner preferences versus project facts, consolidating and retiring lessons, and when a recurring procedure deserves a new skill, with good and bad examples.
---

# Turning a run into lessons

The team's memory is read by every agent at the start of every future assignment. Each lesson you store costs attention on every run from now on, and a wrong or vague one makes the team worse. Store few, store precisely, and remove what has stopped being true.

Your output is the retrospective: `summary`, `role_lessons` (each with `role`, `lesson`, `evidence`), `team_lessons`, `owner_preferences`, `project_facts`, `retire_lesson_ids`, and `skill_proposals` (each with `role`, `name`, `description`, `body`).

## 1. Read the record as evidence

You are given the factual record of the run: which reviews sent work back and why, what verification found and who owned each finding, what the owner said at approval points, which steps failed or were refused actions, and lessons the agents proposed themselves.

- Look for what happened more than once. One finding is an event; the same kind of finding from three tasks is a pattern.
- Look for the late catch. Anything found in verification that an earlier phase could have prevented is the most valuable material here, because late faults are the expensive ones.
- Treat the agents' own proposed lessons as suggestions. Keep one only when the record supports it; agents tend to propose lessons that describe what they did rather than what would have changed the outcome.
- A run with few problems can honestly produce few lessons. Do not manufacture them.

## 2. Attribute to the role that could have prevented it

A lesson goes to the role whose different action would have stopped the problem, not the role that found it and not necessarily the role that fixed it.

Trace each significant finding back through the phases and stop at the first point where it could have been caught:

| Found as | Ask | Lesson belongs to |
|---|---|---|
| A defect in verification | Did the task's acceptance criteria cover it? | If not: `staff-engineer` (task breakdown). If yes and it was built wrong: `senior-engineer` |
| The same defect, passed by code review | Should the review have caught it? | Also `staff-engineer` (review), as a separate lesson |
| A missing state or flow | Was it in the screen specification? | If not: `ux-designer`. If it was not in the PRD either: `director` |
| A screen that looks generic | Did the design system specify it precisely enough? | `staff-designer` if not; `senior-engineer` if the specification was clear and ignored |
| A vulnerability in built code | Was it a numbered security requirement in the threat model? | If not: `security-engineer`. If yes and not implemented: the task breakdown or the engineer |
| A contract mismatch at integration | Was the interface fixed precisely in the plan? | `staff-engineer` or `principal-engineer` |
| A deployment surprise | Was it in the deployment plan? | `platform-engineer` |
| Rework after owner feedback | Could a better interview question have surfaced it? | `director` |

Include yourself. The director's requirements, reviews and decisions cause problems like anyone else's, and a retrospective that never finds a lesson for the director is not being honest.

## 3. The test of a good lesson

Keep a lesson only if it passes all four:

1. **It would have changed the outcome.** Had the role read this sentence at the start, the problem would not have happened.
2. **It names the situation.** It begins with, or clearly contains, when it applies. A lesson without a trigger is applied everywhere or nowhere.
3. **It says what to do.** An action, not an attitude.
4. **It will be true on a different product.** If it only makes sense for this one, it is a project fact.

Write each as one or two sentences, in the imperative, with the reason attached. Put the supporting facts from the record in `evidence`, briefly: what happened, how often, where it was caught.

| Weak | Why it fails | Strong |
|---|---|---|
| "Test more carefully." | No situation, no action | "When a form has more than one step, define in the screen specification what happens to entered data on browser back and on refresh; unspecified, it is lost." |
| "Communication between design and engineering should improve." | Attitude | "When the prototype uses a spacing or colour value that is not a token, add the token before handoff; engineers copy the literal value and the system drifts." |
| "The dashboard charts were hard to build." | Describes this product | (project fact, or nothing) |
| "Always validate input." | Everyone already knows it | "When an endpoint accepts an id for an object owned by a user, the task's acceptance criteria must include a test that a different user is refused; review alone missed this." |
| "The engineer forgot the loading state." | Blames, does not instruct | "Before reporting a UI task done, open each screen with the network throttled and with the request failing; loading and error states are not visible otherwise." |

Do not store: restatements of the role's own instructions, things any competent practitioner does anyway, one-off accidents (a network failure, a tool that was down), and anything you are not confident is right. When unsure, leave it out; a missing lesson costs less than a wrong one.

## 4. Team lessons

`team_lessons` are about the spaces between roles: hand-offs, ordering, what one role needs from another's document. They pass the same four tests. Example: "When the architecture changes after the threat model is written, the security engineer must be sent the diff; this run's two late findings came from a component added afterwards."

## 5. Owner preferences and project facts

These are different things and go in different places.

**Owner preferences** are about this person and will hold on their next product: taste, how much they want to be asked, what they consider acceptable scope, how they like to be communicated with. Include only what the record shows, in particular what they changed or rejected. "Rejects centred hero layouts with gradient backgrounds; chose the densest of three directions twice." Their verbatim feedback is already stored word for word; do not repeat it. Write the generalisation it supports, and only when there is enough to generalise from. A single remark is one data point, not a preference.

**Project facts** are about this product and matter only when the team returns to it: decisions made and why, conventions adopted, constraints discovered, accounts and environments, what was deferred. "Authentication uses the organisation's existing identity provider; local passwords were ruled out by the owner." Record decisions that a future run might otherwise reopen.

Do not record secrets, credentials, personal data about real people, or anything the owner said in confidence about third parties.

## 6. Confirming, consolidating and retiring

You are shown the current memory with an id on each lesson and a count of how often each has been confirmed.

- **Confirming.** When this run supports an existing lesson with new evidence, restate it in nearly the same words. The memory recognises the match and raises its count, which moves it up for every future recall. Rewording it heavily creates a duplicate instead.
- **Retiring.** Put a lesson's id in `retire_lesson_ids` when this run showed it to be wrong, when following it caused a problem, when it has been made redundant by a change to the role's instructions or skills, or when a better lesson now covers it.
- **Consolidating.** When a role's list is marked as too long, or you see several lessons that say nearly the same thing, retire the overlapping ones and write one merged lesson in their place that keeps the trigger and the action of each. Retire the weakest first: lowest confirmation count, oldest, most general.
- **Contradictions.** If two lessons point opposite ways, decide which the record supports, retire the other, and if both are right in different situations, rewrite them so each names its situation.

Never retire a lesson only because it was not relevant to this run.

## 7. When a procedure deserves a skill

Propose a skill only when all of these are true:

- the run revealed a multi-step procedure, not a single rule
- a role had to work it out, and the working-out cost real effort or went wrong first
- the same procedure will be needed again on other products
- it is too long to be a lesson: it needs ordered steps, a checklist or a template

Most runs should propose none. A lesson is nearly always enough.

When you do propose one: `role` is the role that will use it; `name` is short, lowercase with dashes; `description` is one sentence starting "Use when" that says exactly when to reach for it; `body` is the complete procedure, written so a capable agent who was not on this run could follow it: the steps in order, what to check at each, the common mistake, and the output. Write the body from what worked on this run, not from general knowledge. A new skill changes how a role works from now on, so the owner is asked to confirm it when they are present.

## 8. The summary

Three to six sentences for the owner: how the run went against its goal, the two or three things the team will do differently next time, and anything about how the team works that the owner should know. Plain language, no internal step ids. If the main cause of rework was something the owner could change, such as an answer that came late, say so courteously and specifically.
