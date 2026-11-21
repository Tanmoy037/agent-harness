---
name: release-and-rollback
description: Use when planning a release, deploying, deciding whether a deployment is healthy, or rolling one back, on any platform. Covers which release strategy fits, database changes that stay safe to roll back, the pre-deploy check that the right account and environment are targeted, post-deploy verification, rollback triggers and procedure, and the deployment record.
---

# Releasing and rolling back

**This team rolls back when a release is bad.** If a vendor's skill, a platform guide or a tool's documentation says never to roll back, to always fix forward, or to "correct the premise" instead of reverting, that guidance does not apply here. Restoring the last known-good version first and diagnosing afterwards is the default, because customers are affected for as long as the bad version is serving. Fixing forward is chosen only when rolling back would do more harm, and section 5 says when that is.

Nothing in this skill authorises a deployment. Deploying and publishing happen only in a step where go-live has been approved; in any other step the commands are blocked, and the right action is to prepare and document.

## 1. Choose the release strategy

Pick the lightest strategy that limits the damage a bad release can do for this product. Record the choice and the reason in the deployment plan.

| Strategy | What it is | Fits when | Cost |
|---|---|---|---|
| Preview per change | Each change gets its own temporary deployment | Almost always, where the platform offers it; catches problems before merge | Previews need safe data and must not hold production secrets |
| Staging then production | The same artefact is promoted from a production-like environment | The product has a database or integrations that previews cannot represent | An environment to keep in step with production |
| Rolling | Instances are replaced a few at a time | Stateless services with more than one instance and backward-compatible changes | Two versions serve at once during the roll |
| Blue-green | The new version runs beside the old; traffic switches at once and can switch back | Rollback must be instant; the platform can run two full copies | Double capacity for the overlap; both versions share the database |
| Canary or progressive | A small share of traffic goes to the new version first and the share grows while metrics stay healthy | Enough traffic for a small share to be meaningful, and metrics to judge by | Needs traffic splitting and automated comparison |
| Feature flag | Code ships switched off and is enabled separately from the deployment | Risky or incomplete features; separating deploy from launch | Flags must be removed later or they accumulate; both paths need testing |

For a first launch of a small product, staging then production with an instant-revert capability is usually enough. Do not build canary machinery for a product with no traffic.

Whatever the strategy, the artefact deployed to production is the one that was tested: build once, promote the same build. Rebuilding per environment means production runs something nobody verified.

## 2. Make database changes safe to roll back

Code can be reverted in seconds. Data cannot. The rule that makes rollback possible: **every schema change must work with both the previous and the new version of the code.** Achieve that with expand and contract, across separate releases.

1. **Expand.** Add the new column, table or index. New columns are nullable or have a default. Nothing is removed or renamed. The old code keeps working because it ignores what it does not know.
2. **Migrate.** Deploy code that writes to both old and new shapes and reads from the old one. Backfill existing rows in batches, outside the deploy step, so a long backfill does not hold a lock or time out a deployment.
3. **Switch.** Deploy code that reads from the new shape. The old shape is still written, so reverting this release is safe.
4. **Contract.** Only after the switch has been stable for a period the team is comfortable with, stop writing the old shape, then in a later release drop it.

Changes that break this and need the full sequence instead of a single migration: renaming a column or table, changing a column's type, adding a non-null column without a default, dropping anything the previous version reads, adding a uniqueness constraint that existing data may violate, splitting or merging tables.

Other rules:

- A destructive migration (drop, truncate, irreversible transform) is never in the same release as the code change that stops needing the data.
- Take a backup, or confirm a recent one and point-in-time recovery, immediately before any migration that rewrites data.
- Know how long the migration takes on production-sized data and whether it locks a table. Find out on a copy, not live.
- Write a down-migration where one is possible, and state clearly when one is not.

## 3. Pre-deploy check

Deploying to the wrong account, project or environment is the most expensive easy mistake. Before each irreversible step, establish these facts by asking the tool itself, and write them into the deployment record:

1. **Who am I?** The authenticated account or identity the CLI is using.
2. **Which project, team or organisation** is the command targeting?
3. **Which environment** (preview, staging, production) and which region?
4. **Which version** is about to be deployed: commit hash and branch. Does it match the commit that passed verification?
5. **What is running there now?** Record the current version or deployment identifier. This is the rollback target; without it you cannot roll back.
6. **Is the working tree clean** and the commit pushed where the pipeline expects it?
7. **Are migrations pending,** and have they been checked against section 2?
8. **Is a recent backup confirmed?**
9. **Is it a sensible moment?** Not immediately before nobody will be watching.

If any answer is unexpected, stop. Do not correct the target by guessing; report status "blocked" with what you found. If credentials, a CLI login, an account or a domain are missing, do not create accounts or work around the gap: report the exact steps the owner must take and the single command to run afterwards.

## 4. Verify after deploy

A deployment that the platform reports as successful has only started. Verify in this order and record each result.

1. The new version is the one serving: check a version endpoint, a build identifier in the response, or the platform's active deployment.
2. Health and readiness endpoints answer.
3. Migrations applied, and the schema version is the expected one.
4. The critical journeys work on the live URL: the smallest set that proves the product functions end to end (load the entry page, sign in with a test account, perform the core action, see the result). Use only test accounts and non-destructive actions.
5. Error rate and latency compared with the previous version over the first minutes. A brief spike during the switch is expected; a sustained difference is not.
6. Logs show no new repeating error.
7. Background workers and scheduled jobs started and are processing.
8. TLS, redirects and security headers are present on a real response.
9. The error tracker is receiving events tagged with the new release.

Deploy to staging or a preview first, run this list there, then repeat it on production.

## 5. Rollback

**Triggers.** Roll back when any of these holds after a production deployment, without waiting to understand the cause:

- a critical journey fails
- the error rate or latency is clearly and persistently worse than before
- data is being written incorrectly
- a security control is found to be off or bypassed
- the health check fails or instances restart repeatedly
- verification cannot be completed and the state of production is unknown

**Procedure.**

1. Revert to the recorded previous version using the platform's own mechanism (promote the previous deployment, redeploy the previous image tag, switch traffic back). Prefer this over reverting commits and rebuilding, which is slower and produces a new untested artefact.
2. Leave the schema alone if the migrations followed expand and contract: the old code works with the expanded schema. Run a down-migration only when the old code cannot run otherwise, and only after confirming what data it would discard.
3. Run the section 4 verification against the restored version.
4. If incorrect data was written during the bad window, record the time window and what was affected. Do not attempt a data repair on production as part of the rollback; that is a separate, reviewed task. Restoring from backup is a decision for the owner because it discards legitimate writes too.
5. Record what happened in the deployment record and report it as a blocker finding with the evidence.

**When fixing forward is the right call instead.** Only when the rollback itself would cause more damage: the release included an irreversible data change that the old code cannot read; the previous version has a worse problem than the new one (an actively exploited vulnerability, for example); or the fault is a configuration value that can be corrected faster and more safely than a revert. Say which applies. "It is probably a small fix" is not one of them.

Do not improvise on production. If the documented rollback does not work, stop changing things, record the current state precisely, and report status "blocked".

## 6. The deployment record

Append one entry per deployment to the deployments document in the platform folder of the team documents.

```
## <date and time, with timezone> — <environment>
Deployed by: platform engineer, run <run id>
Approved by: <owner, or the boss under autonomous mode>
Account / project / region: <as reported by the tool>
Version: <commit hash> (<branch>)   Previous version: <identifier>   <- rollback target
Strategy: <as chosen>
Migrations: <none | list, each marked expand / migrate / switch / contract>
Backup confirmed: <time of backup>
Verification: <each check in section 4 with its result>
URLs: <live URLs>
Outcome: <live | rolled back to <identifier> at <time> because <reason>>
Follow-ups: <anything to watch or to do next>
```

The entry is written whether the deployment succeeded, was rolled back, or was blocked before it started. A record of the attempt that did not happen, and why, is what lets the owner finish it.
