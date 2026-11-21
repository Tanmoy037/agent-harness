---
name: risk-register
description: Use when writing the brief or PRD, reviewing a phase, triaging findings, or making the go / no-go decision, to record and track what could make the product fail, ship late or cause harm. Defines the living risk register kept in the team documents - fields, scoring, owners, triggers, review points per phase, and how risks feed the release decision.
---

# The risk register

A risk is something that has not happened yet and might. Once it has happened it is an issue and belongs in a finding or a fix task. The register exists so that risks named early are still in view when the release decision is made, instead of being mentioned once in a document nobody reopens.

Keep it at `product/risk-register.md` in the team documents. The boss owns the file. Other roles report risks in their findings and handoffs; the boss enters them. It is a living document: update it at every review point below, and never delete a row.

## 1. What belongs in it

Enter a risk when it is specific to this product or this run and someone could do something about it. Leave out the generic ("the project might be late", "there could be bugs") because a risk nobody can act on is noise.

Sources to draw from, by category:

| Category | Typical risks |
|---|---|
| Product | Building the wrong thing; a core assumption about users is untested; scope too large for an excellent first version |
| Market | A competitor already does this well; pricing assumption unsupported; a platform the product depends on may change its terms |
| Design | The chosen direction depends on assets that do not exist (photography, illustration, a licensed typeface); a flow has an unresolved hard case |
| Technical | An unproven library or service; an integration with an undocumented system; a performance target with no evidence it can be met; data migration |
| Security and privacy | Sensitive data handled; a control that depends on correct configuration; third-party code with broad access |
| Operational | No tested restore; a single person or credential everything depends on; cost that scales with abuse |
| Delivery | A dependency on something the owner must provide; a decision still open; a phase whose review did not fully resolve |
| Legal and compliance | Regulated data; licences of dependencies, fonts or images; claims in marketing copy |

## 2. Fields

One row per risk, in a table, with the detail below it when a row needs more than fits.

| Field | Content |
|---|---|
| ID | `R-1`, `R-2`, in order of entry; never reused |
| Risk | One sentence in the form "If <cause>, then <event>, leading to <consequence>". The form forces a real risk: "performance" is a topic, "if the report query scans the full orders table, the dashboard will exceed the two-second target once a customer has a year of data" is a risk |
| Category | From the table above |
| Likelihood | Low, medium or high, with the reason in a few words |
| Impact | Low, medium or high, with the reason |
| Level | From the scoring grid |
| Response | Avoid, reduce, transfer or accept, and the specific action |
| Owner | The role id responsible for the response |
| Trigger | The observable sign that the risk is turning into an issue, and what happens then |
| Status | Open, reducing, closed, accepted, or occurred, with the date or phase of the last change |
| Source | Where it was raised: the document, review or finding |

## 3. Scoring

Use three levels each way. Finer scales give a false sense of precision.

**Likelihood.** High: more likely than not, or it has already shown signs. Medium: plausible, has happened on comparable products. Low: would need several things to go wrong.

**Impact.** High: a must-have cannot ship, user data is exposed or lost, the owner is harmed legally or financially, or the product is unusable for a main journey. Medium: a should-have is lost, a visible quality problem, a material delay or cost. Low: an inconvenience with a workaround.

| | Impact low | Impact medium | Impact high |
|---|---|---|---|
| **Likelihood high** | Moderate | High | Critical |
| **Likelihood medium** | Low | Moderate | High |
| **Likelihood low** | Low | Low | Moderate |

Score before the response is applied, then re-score when the response is in place. A risk whose level has not changed after its "response" did not really get one.

When you do not know the likelihood, say so and score it medium. An unknown is itself a reason to investigate, and the response can be "find out", with an owner.

## 4. Responses, owners and triggers

- **Avoid**: change the plan so the risk cannot occur. Cut the feature, choose the proven technology.
- **Reduce**: lower the likelihood or the impact. A spike, a test, a fallback, a limit.
- **Transfer**: move it to someone better placed. A managed service instead of self-hosting.
- **Accept**: do nothing now, knowingly. Only for low and moderate risks, or with the owner's agreement for anything higher.

Every response names a concrete action and one owner by role id. "The team will monitor" is not a response; "the platform engineer sets a budget alert at the stated amount before launch" is.

Every open risk at moderate or above has a trigger: what you would see, where you would see it, and what is done when you do. "Trigger: the integration task's review reports that the partner API lacks the bulk endpoint. Then: fall back to per-record calls with a queue, and the principal engineer revises ADR-5."

Critical and high risks need a response that is actually scheduled: it appears in the PRD, the architecture, a task, a test or the runbook. A response that lives only in the register will not happen. Record where it was scheduled.

## 5. Review points

Update the register at each of these. For each open risk, check whether it has changed, and add what the phase revealed.

| When | What to do |
|---|---|
| Writing the brief | Enter the first risks: assumptions about users and market, constraints, anything the owner flagged or left unanswered |
| Finalising the PRD | Add risks raised by the engineering and UX challenges; make sure each high risk has a response reflected in scope or requirements |
| After the codebase survey, for an existing product | Add the danger zones and unknowns the engineers reported |
| Design review | Add design and content risks; close product risks the design resolved |
| Architecture review | Add the risks named in the architecture, test strategy, threat model and deployment plan; assign owners; check each high risk maps to a task or a test |
| Each verification round | Mark risks that occurred (they become fix tasks); add risks revealed by findings; re-score what the fixes reduced |
| Go / no-go | The full pass described below |
| Retrospective | Note which risks occurred without having been in the register: that gap is a lesson |

Any time a review ends with unresolved points, each one is entered as a risk rather than left in a review summary.

## 6. How risks flow into go / no-go

At the release decision, go through every row that is not closed.

- **Critical, open**: no-go. Either the response is completed and the risk re-scored, or the owner explicitly accepts it. Under fully autonomous mode, do not accept a critical risk on the owner's behalf; that is a no-go with the risk named.
- **High, open**: go only if the response is in place and working, or the remaining exposure can be written as a concrete condition of release with an owner and a time. Name each in the decision summary.
- **Moderate, open**: may be accepted. List them in the summary in one line each so the owner sees what is being carried.
- **Low**: no action needed beyond keeping the row.
- **Accepted** risks stay in the register with who accepted them and when, and their triggers go into the runbook's "what to watch" section so someone is looking for them after launch.

A risk is closed only with a reason: the response removed it, the feature was cut, or the uncertainty was resolved by evidence. "No longer relevant" without a reason is not a closure.

## Template

```
# Risk register
Last reviewed: <phase>, run <id>

| ID | Risk | Category | Likelihood | Impact | Level | Response | Owner | Trigger | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| R-1 | If the partner booking API has no bulk endpoint, then the nightly sync will take hours, leading to stale availability each morning | Technical | Medium: docs are silent | High: core journey | High | Reduce: spike the API in the first task; fallback is a queued per-record sync | principal-engineer | Spike task reports no bulk endpoint -> adopt fallback, revise ADR-5 | Open (architecture) | architecture.md, risks |

## Notes
R-1: scheduled as task `spike-partner-api`; re-score when it merges.
```
