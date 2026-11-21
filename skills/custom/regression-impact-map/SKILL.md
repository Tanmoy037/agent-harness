---
name: regression-impact-map
description: Use when planning or performing regression testing, that is, building the map from every product flow to what could break it and how it is checked, or working out the blast radius of a specific change, fix or dependency upgrade across the rest of the product. Also use for an existing product where a change must not break what already works.
---

# Regression and impact map

A feature that works and breaks two others is a net loss. Testing only what changed finds the first kind of defect; the regression map finds the second. It has two parts: a standing map of every flow and its protection, and a procedure for working out what a particular change can reach.

The map lives in the test strategy (`qa/test-strategy.md` in the Team documents folder), or in `qa/regression-map.md` linked from it when it grows long. Its input is `product/product-flows.md`: the flow identifiers and the shared-state map.

## Part 1: the standing map

One row per flow in the product-flows document.

| Flow | Depends on | What could break it | Checked by | Level | Runs | Gap |
|---|---|---|---|---|---|---|
| F-07 Accept invitation | invitations API, auth service, memberships and invitations tables, email link format, session middleware | token format change; change to sign-up; membership constraints; routing of deep links when signed out | `e2e/invitations.spec.ts` "accept as new user", "expired link"; `test/api/invitations.test.ts` | end-to-end, integration | every merge | signed-in-as-other-account path is manual only |

How to fill each column:

- **Depends on**: every component, data entity, external service, configuration value and feature flag the flow touches. Take them from the steps table of the flow; do not rely on memory.
- **What could break it**: go through the list below and write the ones that apply.
- **Checked by**: the exact test file and test name, or the manual script. "Covered by tests" is not an entry; a reader must be able to run it.
- **Level** and **Runs**: unit, integration, contract, end-to-end, visual or manual; and every merge, nightly, or before release.
- **Gap**: what in column three has no check. Gaps become findings or test tasks. An honest gap column is the most useful part of the map.

### What breaks flows that nobody touched

Use this as a checklist for column three:

- a shared data entity changes shape, constraint or meaning;
- a shared component, layout or style token changes;
- authentication, session or permission logic changes;
- routing, navigation or redirects change;
- configuration, environment variables or feature flags change or differ between environments;
- a third-party API, SDK or webhook changes;
- a background job's timing, ordering or retry behaviour changes;
- caching: stale data after a write elsewhere;
- a migration or backfill alters existing rows;
- a dependency is upgraded;
- dates, time zones, locales and number formats;
- two users or two tabs acting on the same thing.

## Part 2: the reverse index

Blast-radius questions run from code to flows, so keep the map in that direction too. Start from the shared-state map in the product-flows document and extend it:

| Entity, component or module | Flows that depend on it |
|---|---|
| memberships table | F-03, F-07, F-09, F-12 |
| session middleware | every authenticated flow |
| design tokens, global styles | every flow with a screen |
| Button, Form field components | F-02, F-04, F-06, F-07, F-11 |
| payment provider client | F-12, F-13 |

Build it from the flows' "Depends on" columns, then verify the high-traffic rows against the code by searching for who imports or queries the item. For an existing product, the area documents in `knowledge/` list interfaces and shared data; use them.

## Part 3: blast radius of a change

Run this for every change you verify: a task branch, a set of fixes, an upgrade.

1. **List what changed**: `git diff --name-only <base>...HEAD`, and read the diff, since a one-line change to a shared function matters more than a new file.
2. **Map files to things**: which component, entity, module or configuration each file belongs to.
3. **Go one hop outwards**: who calls the changed functions, who reads the changed data, which screens use the changed component, which jobs consume the changed events. Search the code (`grep -rn` for the symbol or table name) instead of assuming. For a schema change, every reader and writer of that table is in scope.
4. **Look up the flows** in the reverse index for everything from steps 2 and 3.
5. **Add the always-run flows**: sign-in, the product's primary task, and anything involving money or irreversible actions, whatever changed.
6. **Classify** each flow: directly changed, one hop away, or unrelated.
7. **Choose the checks**: for directly changed flows, every check in the map plus exploratory testing of the changed behaviour; for one-hop flows, their end-to-end check and the failure paths that involve the shared item; for unrelated flows, the standard suite.
8. **Handle the gaps**: any in-scope flow whose relevant risk has no automated check is tested by hand now and reported as a finding recommending a test, owned by the role that should write it.

### Treat as "everything is in scope"

Some changes reach every flow, and narrowing the scope for them is how regressions ship: authentication or session code, shared middleware, the database schema of a central entity, global styles and design tokens, the build or bundler configuration, environment and deployment configuration, a framework or runtime upgrade, and anything in folders named shared, common or core. For these, run the full map.

## Impact assessment record

Write one for each change you verify, in your verification report:

```
Change: fix3-invite-expiry (commit abc1234)
Files changed: src/api/invitations.ts, src/models/invitation.ts
Things affected: invitations API, invitations table (expiry column semantics)
One hop: invitation email job (reads expiry), team settings pending list (reads invitations)
Flows in scope: F-06 direct, F-07 direct, F-03 one hop, F-12 one hop (seat count), plus always-run F-01, F-02
Checks run: <test names and results>; manual: accept with a link created before the change (old rows)
Not covered: none | <flow and risk>, reported as finding
Result: no regression found | regressions: <finding titles>
```

The line about rows created before the change is deliberate: existing data is the part of the product that new tests never exercise unless someone thinks of it.

## Existing products

- Start from `knowledge/testing.md`: which suites exist, what they protect, what is flaky or disabled.
- Run the existing suites before any change is made and record the baseline, including tests that already fail. Without a baseline you cannot tell a regression from a pre-existing failure.
- A flow with no automated check in an area that the change touches is the highest risk on the map. Ask for characterisation tests as part of the task before the change, through a finding or the test strategy's merge gate.
- Flows reconstructed with "Not determined" cells get manual exploratory time before release.

## Keeping the map current

Update the row when a flow gains or loses a check, when a gap is closed, and when a regression escapes: an escaped regression means a "what could break it" entry or a reverse-index row was missing, so add it and record a lesson in your report. A map that only grows from real escapes gets more accurate with every run.
