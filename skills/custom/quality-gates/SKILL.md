---
name: quality-gates
description: Use when defining or applying the checks that work must pass before a task merges, before the product is accepted, and before it is released - what each gate requires, the evidence that satisfies each item, how to record the sign-off, and what to do when a gate fails.
---

# Quality gates

A gate is a short list of things that must be true, each with the evidence that proves it. Its purpose is to stop a problem at the cheapest point: a defect caught at merge costs one engineer ten minutes, the same defect caught after release costs the customer's trust. A gate only works if it is checked against evidence. "The engineer says the tests pass" is a claim; the test output is evidence.

Three gates. Define them in the test strategy, adjusted to the product's stack and to the numbers in the PRD, then apply them exactly as written.

## Gate 1: before a task merges

Applied by the staff engineer in code review, on the task branch.

| Must be true | Evidence |
|---|---|
| The build succeeds from a clean install | Build command output, run by the reviewer |
| Linter and type checker are clean | Their output; no new suppressions without a reason in the code |
| All existing tests pass | Test run output with counts |
| New behaviour has tests that would fail without the change | Reviewer reads the tests; for a bug fix, the test fails on the parent commit |
| Every acceptance criterion of the task is met | Each criterion ticked against a test or a manual check the reviewer performed |
| No secret, credential or personal data is committed | Diff read; secret scan if available |
| The change stays inside the task's scope | Diff read against the task's file list |
| UI matches the design specification | Screenshots at phone and desktop widths compared with the prototype |
| Accessibility basics hold for new UI | Keyboard path works; automated check shows no new violations |
| Migrations are reversible or the plan says why not | Migration read; down path or expand-and-contract steps present |

## Gate 2: before the product is accepted

Applied by the principal QA engineer, on the integrated branch, for the whole product.

| Must be true | Evidence |
|---|---|
| Every must-have story's acceptance criteria pass | Traceability matrix: story, criterion, test or manual check, result |
| Every journey in the product flows works end to end | Walkthrough record per journey, per user type |
| Nothing that worked before is broken | Full regression suite output; for an existing product, the pre-existing suites and the flows the change could touch |
| No open blocker or major finding | Findings list with status |
| Non-functional targets in the PRD are met | Measurements against each number: load time, response time, bundle size, accessibility score |
| Security requirements from the threat model pass | Security review table: requirement, pass or fail, evidence |
| The product matches the approved design | Design QA document with no blocker or major deviation |
| Automated tests run in one command and are stable | Three consecutive clean runs; flaky tests fixed or quarantined with an owner |
| A newcomer can install, run and test it | README commands executed from a clean checkout |

## Gate 3: before release

Applied by the director in the go / no-go decision, on evidence from QA, security and platform.

| Must be true | Evidence |
|---|---|
| Gate 2 passed on the commit being released | Verification report naming the commit |
| The production build is the one that was tested | Same commit, same artefact or reproducible build |
| The delivery pipeline runs the gates | Pipeline definition; a run showing each stage |
| Deployment security review has no open blocker or major | Deployment review document |
| Rollback is defined and has been rehearsed where possible | Runbook steps; rehearsal result or a stated reason it could not be rehearsed |
| Data is safe | Backup exists and a restore was tested, or there is no data yet |
| Monitoring and error tracking will show a failure | A test error appears in the tracker; a health check is watched |
| Configuration and secrets are in place for production | Checklist of every setting, without values |
| Deferred items are acceptable to ship without | List with the director's decision on each |

## Applying a gate

1. Take the list as written. Do not skip an item because it "obviously" passes.
2. For each item, obtain the evidence yourself: run the command, open the screen, read the diff. Reports from the person who did the work tell you where to look, not what is true.
3. Record pass, fail or not applicable, with the evidence, in the sign-off table below. "Not verifiable" is a fail until someone makes it verifiable.
4. One failed item fails the gate. Report each failure as a finding with severity and the owner who can fix it.
5. A gate is never lowered to let something through. If an item is wrong for this product, change the gate's definition in the test strategy, with the reason, before applying it; not during.

## Sign-off record

Keep it in the verification report so the next gate can rely on it:

```
Gate: 2 (acceptance)    Commit: <sha>    Date: <date>    Applied by: principal-qa
| # | Item | Result | Evidence |
| 1 | Must-have stories pass | pass | traceability matrix, 41/41 criteria |
| 2 | Journeys end to end | fail | "Invite teammate" breaks at step 4 on phone width; finding F-7 |
Result: FAIL (1 item). Blocking findings: F-7.
Not verified: load test at 10x (no environment); recorded as risk R-4.
```

## When a gate fails

- Say exactly which item failed and what would make it pass. A failed gate with a vague reason gets argued with; a precise one gets fixed.
- Re-apply the whole gate after fixes, not only the failed item: fixes break other things.
- If the same item fails on a second run, that is a lesson about how the team works. Put it in your report's lessons with the role that could prevent it.

## Waivers

Only the director may accept a known failure, only at Gate 2 or 3, and only in writing: what is waived, why, the risk, and when it will be fixed. A waiver is recorded in the sign-off table as "waived", never as "pass". Accessibility blockers, security blockers and data-loss defects are not waivable.
