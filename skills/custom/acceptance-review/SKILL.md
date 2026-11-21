---
name: acceptance-review
description: Use when deciding whether to accept the built product against the PRD after QA, security and design have examined it, or when turning their findings into fix tasks. Covers the criterion-by-criterion evidence table, checking claims yourself, what blocks acceptance, writing fix tasks that can be acted on, and what may be deferred.
---

# Accepting or rejecting delivered work

You wrote the requirements, so you are the one who says whether they were met. Acceptance is a decision made against evidence, criterion by criterion. It is not a summary of how the reports felt.

Your output is the triage decision: `verdict` (`accept` or `fix`), `summary`, `fix_tasks` (each with `id`, `title`, `description`, `acceptance`, `owner`), and `deferred`.

## 1. Build the evidence table

Open the PRD and go through every must-have story and every release criterion in order. For each, fill one row. Do the same for should-haves, more briefly.

```
| PRD ref | Criterion | Evidence | Verified by | Status |
|---|---|---|---|---|
| US-4 AC-2 | Booking over capacity is refused with the message "This slot is full" | e2e test bookings.spec "refuses over capacity" passes; I submitted the form at capacity and saw the message | test + my own check | Met |
| US-7 AC-1 | Reset link expires after 30 minutes | QA report says tested; no test in repo, expiry constant is 24h in auth/reset.ts | code read | NOT MET |
| RC-3 | Largest page under 2.5s on a mid-range phone | No measurement in any report | none | NOT VERIFIED |
```

Three statuses only: **Met** (there is evidence and it holds), **Not met** (there is evidence it fails), **Not verified** (nobody showed it either way). Not verified is not a pass. A must-have without evidence is treated as not met until someone produces the evidence.

Evidence, strongest first: you ran it and saw it; an automated test that exercises the behaviour and passes; a reviewer's report with reproduction steps or a screenshot; a reviewer's statement with nothing attached. Weight accordingly.

## 2. Check the important claims yourself

The reports are written by agents who want their work to be finished. Read them as testimony, then verify what matters.

- **Run the product** and walk the two or three journeys the whole thing exists for, start to finish, as a user would. If the product does not start from the README's instructions, that alone is a blocker.
- **Run the test suite** and compare the numbers with what the report states. A report that says "all tests pass" beside a suite with failures or skips is a finding about the report as well as the code.
- **Spot-check a sample** of rows marked as passing by QA: pick the criteria with exact values (limits, messages, timings) and confirm the value in the product or the code.
- **Open the screens** if the product has an interface, at phone and desktop width, and compare them with the approved design's screenshots. Ask whether a customer in this industry would take it for a product made with care or for a generic template.
- **Read the security review's open items** and confirm each fix that was claimed is actually in the code.
- **Look for what nobody reported on.** A must-have that appears in no report was probably not tested.

When a reviewer's "verified" turns out not to hold, say so in the summary. The retrospective uses it.

## 3. What blocks acceptance

Reject (`fix`) when any of these is true:

- a must-have criterion is not met or not verified
- any blocker finding is open
- a major finding is open and you cannot state a specific reason it is safe to ship with
- the security review has an open vulnerability that exposes user data, allows acting as another user, or allows taking over an account
- something that worked before no longer works (for an existing product, any regression in an existing flow)
- the product cannot be installed, started and tested by following its own README
- the build, the type check or the test suite fails
- for a product with an interface: the built screens have drifted from the approved design enough that the owner would notice, or accessibility basics fail (keyboard reachability, visible focus, contrast, labels)
- a release criterion with a number attached has not been measured

Accept when none of these holds. Do not hold acceptance hostage to preferences: a finding that amounts to "I would have done this differently" with no consequence for a user, the owner or the next engineer is not a reason to send work back.

## 4. Writing fix tasks

Each fix task is handed to an engineer who has not read the reports and will work on it alone in a fresh checkout. If the task cannot be acted on from its own text, it will come back wrong.

| Field | What goes in it |
|---|---|
| `id` | Short, lowercase, dashes: `reset-link-expiry` |
| `title` | The problem, not the activity: "Password reset link stays valid for 24 hours" not "Fix auth" |
| `description` | What is wrong; where (file, screen, endpoint); how to reproduce it step by step; what correct looks like, with the exact value from the PRD or design; which report found it; anything the engineer must not change while fixing it |
| `acceptance` | Checkable conditions: the behaviour, the test that must exist and pass, and "the full test suite passes". Quote the PRD reference |
| `owner` | The role that can fix it: `senior-engineer` for product code, `staff-designer` when the design itself is wrong, `platform-engineer` for pipeline and configuration, `staff-engineer` for a cross-cutting or architectural fault |

Grouping rules, because fix tasks run in parallel in separate worktrees:

- Put findings with the same root cause, or in the same files, into one task. Two tasks editing the same file collide at merge.
- Keep unrelated findings in separate tasks so they can be fixed at the same time.
- Do not create a task per symptom when one cause produces five symptoms. Name the cause and list the symptoms as its acceptance checks.
- Do not bundle a must-fix with a nice-to-have. The nice-to-have goes in `deferred`.

A weak task and its repair:

> **Weak:** "Checkout has some validation issues, please fix."
>
> **Usable:** title "Checkout accepts an expired card date". Description: "On /checkout, entering an expiry month earlier than the current month is accepted and the order is created (QA report, finding 6). Reproduce: add any item, go to checkout, enter 01/2020, submit. Expected per US-12 AC-3: inline error 'This card has expired' under the expiry field, order not created. The check should be on the server as well as in the form; validation lives in src/checkout/validate.ts. Do not change the payment provider integration." Acceptance: "Past expiry is rejected client-side and server-side with the specified message; a test covers both; full suite passes."

## 5. What may be deferred

Put an item in `deferred`, with its reason, when all of these hold: it is not a must-have; it harms no user's data, security or ability to complete a journey; it is not a regression; and shipping without it would not embarrass the owner. Typical deferrals: a could-have story, a minor visual inconsistency on a secondary screen, a performance improvement beyond the stated target, a refactor.

Write each deferred item as one line that stands on its own, because the owner reads this list at the end of the run: what it is, why it can wait, and what should trigger doing it.

Never defer: anything in section 3, a failing test (delete or fix it, do not skip it), or a security finding marked blocker or major.

## 6. The summary

Three or four sentences: how many must-have criteria are met out of how many, what blocks acceptance if anything, what you checked yourself, and what you are deferring. State numbers. If this is a later verification round, say what changed since the last one and whether the fixes held.

On the last permitted fix round, be strict about what truly blocks: send back only what section 3 requires, and defer the rest explicitly rather than leaving it unmentioned.
