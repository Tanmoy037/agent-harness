---
name: go-no-go
description: Use when making the release decision for a product that has passed verification, weighing the QA, security, design QA and platform evidence. Covers the checklist to work through, what counts as a condition, what a no-go must name, and the decision record.
---

# The go / no-go decision

Acceptance asked whether the product was built correctly. Go / no-go asks a different question: is it safe and sensible to put this in front of real customers today, with the delivery pipeline and operations as they now stand? A product can be accepted and still not be ready to go live, because nobody can restore its database or because the owner has not yet provided a domain.

"Go" is a recommendation with your name on it. Under approval modes where the owner approves go-live, they will read your summary and decide; under fully autonomous mode your "go" is what authorises the deployment. Write it for both cases.

Your output is the release decision: `verdict` (`go` or `no-go`), `summary`, and `conditions`.

## 1. Gather the evidence

Read each of these in the team documents. Note the date or run of each, and discard any that describes a version of the product older than the last fix round.

| Evidence | Document | What you take from it |
|---|---|---|
| Requirements and release criteria | product/PRD.md | The list you are checking against |
| End-to-end verification | qa/product-verification.md | Which release criteria are met, with evidence |
| Test results | qa/test-report.md | Test counts, failures, what was run by hand |
| Product security review | security/security-review.md | Open vulnerabilities and their severity |
| Deployment security review | security/deployment-review.md | Open findings in the pipeline and configuration |
| Design QA, if there is an interface | design/design-qa.md | Whether what was built matches what was approved |
| Runbook | platform/runbook.md | Whether it can be deployed, verified and rolled back; what the owner must provide |
| Deferred items | Your own acceptance decision | What you agreed to ship without |
| Risk register, if kept | product/risk-register.md | Open risks and their triggers |

If a document is missing, that is a finding in itself: the area was not examined.

## 2. Work through the checklist

Answer each line yes, no, or not established, with the document and section that supports it. "Not established" on any line in the first three groups is a no-go.

**The product**
- Every release criterion in the PRD is met, with evidence.
- No blocker or major finding from verification is open.
- The automated test suite passes, in the pipeline as well as locally.
- For an existing product: the existing regression suites pass and the existing flows the change touches were walked.

**Security**
- The product security review has no open vulnerability of consequence, and each one reported earlier was re-checked after its fix.
- The deployment security review has no open blocker or major finding.
- No secret is in the repository, the built artefact, or the logs.
- Dependencies were audited for this release.

**Operations**
- The production artefact was built and run successfully.
- The pipeline's stages were exercised, and its quality gates would stop a bad change.
- There is a rollback procedure, and the previous version to roll back to is identified (or this is a first deployment and there is nothing to roll back to, in which case taking it down is the fallback).
- Database migrations are backward compatible with the previous version of the code.
- Backups are configured, and a restore has been tested or is a dated condition.
- Health checks, error tracking and at least one alert that reaches a human are in place.
- The runbook lets someone who did not build the product deploy, verify, roll back and restore.

**Design and experience** (where there is an interface)
- Design QA has no open blocker or major deviation.
- You have looked at the built screens yourself and they match what the owner approved.
- Accessibility basics pass.

**Readiness to be seen**
- No placeholder copy, test data, debug output or sample accounts are visible.
- Legal and policy pages the PRD calls for exist.
- Analytics or measurement the PRD calls for is in place, so success can be judged after launch.
- What was deferred is acceptable to ship without, and none of it would embarrass the owner on day one.

**What the owner must provide**
- Accounts, credentials, payment methods, domains and DNS access needed for deployment are listed in the runbook, each with where to get it.

## 3. Deciding

**Go** when every line in the product, security and operations groups is a yes, the remaining groups have no open blocker, and anything outstanding can honestly be written as a condition.

**No-go** when a line in those first three groups is a no or not established, or when you would not put this in front of a paying customer today. Trust that second test. If the checklist passes and you are still uneasy, find the reason and name it; unease without a nameable reason is not grounds for a no-go.

Missing credentials or accounts on the owner's side are not a reason for no-go. The product is ready; the deployment is waiting on the owner. Decide "go" and list what they must provide as conditions.

Do not say "go" to end the run, and do not say "no-go" to avoid responsibility. Either decision without specifics is useless to the owner.

## 4. Conditions

A condition is something that must happen at or right after launch, or before a deployment is possible, and that does not need another round of building. Each is one concrete, checkable statement with an owner and a time.

Good conditions:

- "Owner provides a production database connection string in the platform's secret store before deployment (runbook, section 2)."
- "Platform engineer performs a restore test within seven days of launch and records it in the deployments document."
- "Budget alert set on the hosting account before traffic is sent."
- "Watch error rate for the first hour; roll back per the runbook if any critical journey fails."

Not conditions, because they are unfinished work and make the decision a no-go:

- "Fix the remaining failing tests after launch."
- "Add authorisation checks to the export endpoint in the next release."
- "Finish the password reset flow."

If you find yourself writing a condition that begins with "fix", "finish" or "add", the answer is no-go.

## 5. What a no-go must name

A no-go that says "not ready" sends the run nowhere. State, for each thing that blocks:

1. what is missing or failing, with the document and section, or the file and behaviour
2. which checklist line it fails
3. who should address it, by role
4. what evidence would change the decision to go

Keep the list to what actually blocks. Three precise items are more useful than ten, and anything that does not block belongs in a deferred list, not here.

## 6. The decision record

Write `summary` as the record the owner reads at their approval point and anyone can return to later. Four to eight sentences:

- the decision and the one-sentence reason
- the state of each evidence area: product, security, operations, design, in a clause each, with numbers where they exist (criteria met out of total, tests passing out of total, open findings by severity)
- what you checked personally
- what is being shipped without, and why that is acceptable
- for a no-go, the blocking items from section 5

Example of a go:

> Go. All 14 release criteria are met with evidence in the verification report; the suite of 212 tests passes locally and in the pipeline. Both security reviews have no open blocker or major finding; the two major findings from round one were re-checked after their fixes. I ran the production build and walked sign-up, booking and cancellation myself, and compared the six key screens with the approved prototype. The restore test has not been done because there is no production database yet, so it is a condition. Deferred: export to CSV (a could-have) and the dark theme.

If a risk register is kept, update each open risk's status after deciding, and carry any risk you are accepting into the summary by name.
