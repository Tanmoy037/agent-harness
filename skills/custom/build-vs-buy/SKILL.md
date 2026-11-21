---
name: build-vs-buy
description: Use when deciding whether a capability should be built in-house, bought as a commercial product, adopted as an open-source library or self-hosted system, or consumed as a managed service, for example authentication, payments, search, email, queues, analytics or a UI component set. Produces a verified comparison and an ADR-ready decision.
---

# Build, buy, adopt or use a service

Each capability a product needs can be obtained four ways: **build** it, **buy** a commercial product or API, **adopt** open source that you run yourself, or use a **managed service** that runs open source or a proprietary system for you. The wrong choice is expensive in both directions: building commodity capabilities spends the team's effort where it earns nothing, and renting the thing that makes the product different hands its future to a vendor.

Run this method for every significant capability in the architecture and record the result as an architecture decision record.

## 1. Is it core?

Ask whether customers would choose this product because of how this capability works.

- **Core** (the reason the product exists, the workflow nobody else does well): lean towards building, so the team controls it.
- **Commodity** (identity, payments, email delivery, file storage, search, queues, error tracking, feature flags): lean towards not building. Others have spent years on the edge cases and the security.
- **Never build** your own cryptographic primitives, password hashing, payment card handling or session token schemes. The cost of a subtle mistake is out of proportion to any saving.

## 2. Write the requirements first

Before looking at candidates, write what the capability must do, so that candidates are judged against the need and not the need bent to a favourite.

- Functional needs, each marked must or should.
- Numbers from the PRD: volume now and at ten times, latency, availability.
- Constraints: data residency, compliance obligations, where it must run, offline needs, languages and platforms it must integrate with, budget.
- What it must not do, such as sending customer data to a third country.

Also ask whether the requirement itself can be simplified. Dropping a should-have sometimes turns a build into a configuration setting.

## 3. Name the candidates

At least one realistic candidate for each option that is not ruled out by the constraints, plus "do less". Two or three per option is enough. If the existing product already uses something in this category, it is a candidate by default and replacing it needs a reason.

## 4. Verify every candidate now

What you remember about a library or a vendor may be out of date: projects are abandoned, relicensed, acquired and repriced. Check each candidate on the web at the time of the decision and record the URL and the date for every fact.

| Check | Where | What disqualifies or warns |
|---|---|---|
| Does it do the specific thing we need? | Current documentation for that feature | "Planned", "enterprise plan only", or silence |
| Is it maintained? | Release history, commit activity, issue responses | No release in a long time, unanswered security issues, a single maintainer on something critical |
| Licence | The LICENSE file in the repository at the version we would use | See the licence guide below; also check for a recent licence change |
| Security history | The project's advisories, vulnerability databases | Slow fixes, unpatched known issues |
| Price | The vendor's pricing page | Per-seat or per-event prices that explode at ten times our volume; "contact sales" for something we need |
| Limits | Quota and rate-limit pages | A hard limit below our PRD numbers |
| Reliability | Status page history, published service-level terms | Repeated long incidents, no commitment |
| Data | Where it is stored, export documentation | No export, no residency option we need |
| Compliance | Published attestations | Missing one the product is obliged to have |

Write "could not verify" where you could not; an unverified must-have is a risk to carry into the decision, not a pass.

### Licence guide

This is an engineering screen, not legal advice. Raise anything outside the first row with the boss as a finding.

- **Permissive** (MIT, BSD, Apache-2.0, ISC): usable with attribution.
- **Weak copyleft** (LGPL, MPL): usable; changes to the library itself must be shared under its terms.
- **Strong copyleft** (GPL, and AGPL which extends to software offered over a network): can oblige you to release your own source. Do not link it into a proprietary product without a deliberate decision.
- **Source-available** (licences that restrict commercial or hosted use): read the restriction against exactly what the product does.
- **No licence file**: no permission to use at all, whatever the README says.

## 5. Count the whole cost

Compare over about three years, at current volume and at ten times.

- **Build**: the initial work is the smaller part. Add maintenance for as long as the product lives, security patching, operations and on-call, documentation, and the extra surface the team's reviewers, testers and security engineer must cover on every change. Add what the team does not build while building this.
- **Buy or managed service**: subscription at both volumes, integration work, migration of existing data, the cost of the vendor's limits (workarounds), and the risk of a price increase once you depend on it.
- **Adopt and self-host**: integration, hosting, upgrades, backup and monitoring, and the expertise to operate it when it fails at night.

Use rough numbers with the assumptions shown. The purpose is to see order-of-magnitude differences and which cost grows with usage.

## 6. Lock-in and exit

For each non-build option answer:

- What data lives there, and in what format can we get it out? Verify the export exists and is documented.
- How much of our code would change if we replaced it? Keep that small by putting one thin adapter at the boundary: our own function names, their SDK behind it. Do not build a general abstraction over several vendors that nobody asked for; an adapter for the calls we actually make is enough.
- What happens to the product if the vendor has an outage, doubles the price, or shuts down? Is there a second source?

High lock-in is acceptable for a commodity with standard formats and several competing providers. It is a serious cost for anything holding the product's primary data.

## 7. Test the riskiest assumption

If the decision rests on one uncertain claim ("their search handles our filtering", "this library works with our framework version"), prove it with a small time-boxed spike before committing: the one call or one feature, in a scratch folder, with the real version. Record what you ran and what happened. An afternoon here prevents a redesign mid-build.

## 8. Decide

Defaults when the comparison is close:

- Commodity capability: prefer a managed service or a well-maintained permissive library over building.
- Prefer boring, widely used technology with a large body of documentation over something newer and more elegant.
- Prefer what the existing product already uses.
- Prefer the option with the cheaper exit.
- Build when the capability is core, when no candidate meets a must-have, or when the integration and workaround cost exceeds a simple build that fits exactly.

## Output: the decision record

Write one ADR in `engineering/adr/` in the Team documents folder:

```
# ADR-NN: <capability>: <decision>

Status: accepted · Date: <date>

## Context
What the product needs, with the must-haves and the numbers. Core or commodity, and why.

## Options considered
| | Build | <Vendor A> | <Library B> | <Service C> |
|---|---|---|---|---|
| Meets must-haves | | | | |
| Maintained (evidence, date) | | | | |
| Licence | | | | |
| Cost now / at 10x | | | | |
| Lock-in and exit | | | | |
| Main risk | | | | |

## Decision
What we chose and the two or three reasons that decided it.

## Consequences
What we take on: cost, limits, the adapter boundary, what to monitor, and the trigger that would make us revisit (a volume, a price, a missing feature).

## Sources
Every URL checked, with the date.
```

## Warning signs in your own reasoning

- Choosing from memory without opening the current documentation and pricing.
- Comparing a vendor's price against only the initial build effort.
- "We might need to switch one day" used to justify building or abstracting now.
- A candidate rejected for a missing feature that is a should, not a must.
- Building because it is more interesting.
