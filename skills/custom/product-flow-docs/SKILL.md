---
name: product-flow-docs
description: Use when writing or updating the product-flows document that QA, security, platform and engineering plan from, or when reconstructing the flows of an existing product. Gives the fixed template for each user journey with its screens, components, data movement, states and failure points, and the shared-state map used to work out what a change can break.
---

# Product flow documents

`product/product-flows.md` in the Team documents folder describes how the product behaves as a whole: each journey a user or the system takes, what it touches, and where it can fail. Other roles depend on it directly. QA builds the regression map and end-to-end tests from it, security reads it for data crossing trust boundaries, platform reads it for what must be running, and engineers use it to see what their task connects to. Write it for those readers. They need precision and a fixed shape, not narrative.

## Procedure

### 1. Enumerate the journeys

Start from the PRD and list every journey, then add the ones a PRD usually leaves out:

- first visit and sign-up or first run; sign-in, sign-out, password or access recovery;
- each core task from the user's intent to its completion;
- returning use: resuming, editing, searching, notifications bringing the user back;
- account lifecycle: inviting others, changing role or plan, exporting data, closing the account;
- administration and support paths;
- system journeys with no user present: scheduled jobs, incoming webhooks, retries, expiry, data retention;
- money, if any: purchase, renewal, failure of payment, refund.

Every must-have story in the PRD must belong to at least one journey. A story that fits none means a journey is missing.

### 2. Give each journey an identifier

Number them F-01, F-02 and so on and never renumber. Tests, findings and tasks will refer to these identifiers.

### 3. Fill in the template for each

Use the template below exactly. Name components, endpoints, tables and fields with the same names the architecture uses, so a reader can search for them in the code. Use screen names from the screen specification.

### 4. Build the shared-state map

After the journeys, add a table from each data entity and each shared component to the journeys that read or write it. This reverse index is what lets QA answer "what could this change break" in a minute.

### 5. Check it

Run the checklist at the end before you report.

## Template for one journey

```
## F-07 Accept a team invitation

Actor: invited person (may or may not have an account)
Trigger: follows the link in the invitation email
Preconditions: a pending, unexpired invitation exists
PRD stories: 4.2, 4.5
Status: new        (existing | changed | new, for an existing product)

### Steps
| # | Actor does / system event | Screen | Components | Data read | Data written | State after |
|---|---|---|---|---|---|---|
| 1 | Opens link with token | Accept invitation | web app, invitations API | invitations (by token hash) | none | invitation shown |
| 2 | Signs in or creates account | Sign in / Sign up | auth service | users | users (if new), sessions | authenticated |
| 3 | Confirms | Accept invitation | invitations API | invitations, teams | memberships (insert), invitations (accepted_at) | member of team |
| 4 | Lands in the team | Team home | web app | teams, memberships | none | done |

### Failure points
| Step | What can fail | What the user sees | What the system does | How we would know |
|---|---|---|---|---|
| 1 | Token expired or already used | "This invitation has expired" with a way to request a new one | No write | Count of expired-token views |
| 2 | Signs in as a different email than invited | Explanation and choice to switch account | No membership created | Logged with invitation id |
| 3 | Two tabs accept at once | Second sees "already accepted" | Unique constraint prevents double membership | Constraint violation logged, not an error page |
| 3 | Database write fails | Retry message, link still valid | Transaction rolled back, invitation unchanged | Error tracking |

### States
invitation: pending -> accepted | expired | revoked. No other transitions.

### Crosses a trust boundary
Token from email (untrusted) to API. Invited email address shown before authentication: show only the team name, not member data.

### Side effects
Notification to the inviter. Analytics event invitation_accepted. Seat count on the subscription increases (see F-12).

### Depends on / affects
Requires F-06 (send invitation). Changes what F-03 (team home) shows. Shares memberships with F-09 (remove member).

### Healthy in production when
Accept rate and time from send to accept are within the normal range; no constraint errors surfacing to users.

### Open questions
None.
```

The columns are fixed for a reason. "Data written" and "State after" are what a tester asserts on. "What the system does" on failure is what an engineer must build and what security reviews. "How we would know" is what platform turns into monitoring. An empty cell is a decision someone forgot to make: fill it or record the question.

## Document structure

1. **Flow index**: a table of identifier, name, actor, PRD stories and status.
2. **The journeys**, each in the template.
3. **Shared-state map**:

   | Entity or shared component | Read by | Written by |
   |---|---|---|
   | memberships | F-03, F-07, F-09 | F-07, F-09 |
   | session middleware | all authenticated flows | F-02 |

4. **External dependencies**: each third-party service, the journeys that need it, and what those journeys do when it is unavailable.
5. **Glossary** of the product's own terms, so every role uses the same word for the same thing.

## Rules

- One level of detail throughout: a step is one user action or one system event that changes what is on screen or in storage. Do not describe function calls; that belongs in the architecture.
- Every step that writes data or calls an external service has at least one row in the failure table. Consider for each step: invalid input, missing permission, expired or reused link, duplicate submission, two sessions at once, a slow or failed dependency, the user leaving and coming back, and the back button.
- Describe what the user sees on failure in the product's real wording where the UX specification defines it.
- A diagram is optional. When a journey crosses more than three components, add a text sequence diagram after the steps table; the table remains the source of truth.

## Existing products

Reconstruct the journeys that exist before describing the change. Sources, in order of reliability: end-to-end tests, the route table and navigation, screens and their handlers, then documentation. Mark each journey existing, changed or new, and for changed journeys show which steps differ. Journeys you could not fully reconstruct are listed with "Not determined" in the cells you could not fill and a finding for the staff engineer who surveyed that area. QA will treat those as the highest regression risk, so say so plainly.

## Keeping it current

The document is updated whenever behaviour changes: by the principal engineer when the architecture moves, and by whoever finds it wrong. A flow document that disagrees with the product is worse than none, because QA will test the wrong thing with confidence.

## Checklist before you report

- Every PRD must-have story appears in the PRD stories line of at least one journey.
- Every screen in the screen specification appears in at least one steps table.
- Every entity in the data model appears in the shared-state map.
- No empty cells without a recorded question.
- Component and field names match the architecture exactly.
- System journeys (jobs, webhooks, expiry) are present, not only user journeys.
