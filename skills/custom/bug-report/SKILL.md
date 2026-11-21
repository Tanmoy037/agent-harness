---
name: bug-report
description: Use when reporting any defect, regression, vulnerability or deviation found while testing or reviewing - the one format the team uses so that the person who fixes it can reproduce it on the first try, mapped onto the findings in the standard report.
---

# Bug report

A bug report has one reader: the engineer who will fix it, who was not there when you found it and has no way to ask you. Everything they need to see the problem themselves must be in the report. A defect that cannot be reproduced does not get fixed; it gets argued about, and then it ships.

Report every defect as a finding in your report, and write the full version in your test or review document under the same title.

## The format

**Title**: where, what, under which condition. Specific enough to tell it from every other bug.
- Good: "Checkout, phone width: Pay button stays disabled after fixing an invalid card number"
- Bad: "Checkout broken", "Button issue", "Validation doesn't work"

**Severity**: one of the team's four levels.

| Level | Meaning | Examples |
|---|---|---|
| blocker | A must-have cannot be used, data is lost or exposed, or the product cannot ship | Sign-up fails; one user can read another's records; payment is taken twice |
| major | A must-have works badly, a should-have is broken, or many users will hit it | Works on desktop but not phone; error leaves the user stranded; key screen reads as generic template |
| minor | Limited impact with a reasonable workaround | Wrong spacing; unclear message; rare edge case with an obvious recovery |
| note | Not a defect: an observation or suggestion | A flow that could be shorter |

Rate the effect on the user and the business, not how hard it is to fix and not how annoyed you are.

**Environment**: the commit, the route or screen, browser and width or device, the user role and account state, and any data that matters ("account with zero projects").

**Steps to reproduce**: numbered, starting from a known state, one action per step, with the exact values you entered.

```
1. Sign in as owner@example.test (seeded account, no invoices)
2. Go to /invoices/new at 390 px wide
3. Enter card number 4242 4242 4242 424 (15 digits) and tab out
4. See the error "Card number is incomplete"
5. Add the missing digit 2
```

**Expected**: what should happen, with the source: "Error clears and Pay becomes enabled (PRD story 12, criterion 3; screens.md, Checkout, validation)".

**Actual**: what does happen, stated as an observation: "Error text clears but Pay stays disabled until the field is blurred and refocused."

**Evidence**: the failing test's name and output, a screenshot path, the console error, the network response, the log line. Attach the smallest thing that proves it.

**Frequency**: always, or how many times out of how many attempts.

**Owner**: the role that should fix it, not the one that found it: senior-engineer for product code, staff-designer when the design is wrong or silent, platform-engineer for pipeline and environment problems, principal-engineer when the architecture is the cause.

**Suspected cause** (optional): only if you looked and have something concrete, such as the file and line. Mark it as a suspicion.

## Mapping to the report's findings

| Finding field | Put there |
|---|---|
| severity | The level above |
| title | The title |
| details | Steps, expected, actual and evidence, compressed but complete |
| location | Route or screen, file and line if known, commit |
| owner | The fixing role |

## Before you file

- **Reproduce it twice** from a clean state. If it happens only sometimes, say so and say what you tried.
- **Reduce it**: remove steps until the bug stops appearing, then put the last one back. The shortest path is the most useful.
- **Check it is not yours**: wrong test data, a stale build, a server still running from an earlier step, your own test's mistake.
- **One bug per report.** Two symptoms with one cause are one bug; two causes are two.
- **Check it is not already reported** in this round's documents. If it is, add your evidence to that one.
- **Say what you did not test** around it, so nobody assumes the neighbouring cases are fine.

## A complete example

> **Invoice list: totals show the wrong currency for clients billed in EUR** (major)
> Environment: commit 4f2a9c1, /invoices, Chrome, 1440 wide, owner role, seeded account "Northwind".
> Steps: 1. Sign in as owner@example.test. 2. Open /invoices. 3. Find invoice INV-0007 (client "Atelier Blanc", currency EUR).
> Expected: total reads "€1,240.00" (PRD story 9, criterion 2).
> Actual: total reads "$1,240.00". The invoice detail page shows € correctly.
> Evidence: tests/e2e/invoices.spec.ts "list shows client currency" fails: expected "€1,240.00", received "$1,240.00". Screenshot qa/evidence/inv-list-currency.png.
> Frequency: always, for every non-USD client (checked EUR and GBP).
> Owner: senior-engineer. Suspected cause: InvoiceRow formats with the account's default currency (src/components/InvoiceRow.tsx:41), not the invoice's.
> Not tested: exported CSV and email totals.

## What a bad report looks like

> "Currency is wrong on invoices. Please fix."

No screen, no account, no steps, no expected value, no evidence. The engineer opens the list, sees dollars on their dollar test data, and closes it as not reproducible.

## Retesting

When a fix arrives, repeat the original steps exactly, then test the neighbours you listed under "not tested", then make sure an automated test now covers the case. Report "fixed and verified" only for what you re-ran.
