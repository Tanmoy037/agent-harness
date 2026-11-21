---
name: production-readiness
description: Use when judging whether a product is ready to run in production on any platform, before the go-live decision or when reviewing an existing deployment. A platform-agnostic readiness review covering configuration, secrets, DNS and TLS, health checks, tested restore, migrations, observability, capacity, hardening, cost guardrails and the runbook, with the evidence each item requires.
---

# Production readiness review

A readiness item is satisfied by evidence, not by intent. "Backups are configured" is intent. "A backup taken on this date was restored into a scratch database and the row counts matched" is evidence. For every item below, record one of: **met** with the evidence and where it is, **not met** with what is missing, or **not verifiable before go-live** with the exact step that will verify it on first deployment.

Before go-live is approved you cannot touch live infrastructure, so much of the evidence comes from running the production build locally, validating configuration files with the platform's own tooling, and reading the pipeline. Say which kind of evidence each item has. Do not mark something met because the configuration looks right if it could have been run and was not.

Write the review into the platform document named in your assignment as a table with the columns: item, status, evidence, owner of the gap.

## 1. Configuration and environments

- Every setting the product reads is listed in an environment template with its purpose, whether it is required, and an example value that is not a real secret. *Evidence: the template, and a clean start of the product using only the template plus dummy values.*
- The product fails at startup with a clear message when a required setting is missing, rather than at the first request that needs it. *Evidence: start it with one setting removed.*
- Environments differ only by configuration, not by code branches. Production settings are not the defaults. *Evidence: the configuration loader.*
- Debug modes, verbose errors, development tooling, seed data and test accounts are off in the production build. *Evidence: the production artefact, inspected.*

## 2. Secrets

- No secret is in the repository, the image, the client bundle, or the build log. *Evidence: a secret scan of the history and of the built artefact; inspect the client bundle for anything that is not meant to be public.*
- Secrets are supplied by the platform's secret store or environment, with separate values per environment. *Evidence: the deployment configuration.*
- Each secret has a named owner and a rotation procedure in the runbook. Rotating does not require a code change. *Evidence: the runbook entry.*
- CI has only the secrets its jobs need, and jobs triggered by untrusted input (forks, external pull requests) cannot read deploy credentials. *Evidence: the pipeline definition.*

## 3. Domains, DNS and TLS

- The domains, who controls the registrar and the DNS zone, and the records to create are written down. *Evidence: the runbook.*
- TLS certificates are issued and renewed automatically, and plain HTTP redirects to HTTPS. *Evidence: platform configuration; verify on first deploy.*
- The apex and `www` (or the chosen canonical host) both resolve and one redirects to the other. *Evidence: verify on first deploy.*
- If the product sends email, the sending domain's authentication records are specified. *Evidence: the records listed in the runbook.*
- DNS time-to-live values are low enough before a cutover to allow a quick reversal. *Evidence: the cutover plan.*

## 4. Health and lifecycle

- A liveness endpoint answers without touching dependencies; a readiness endpoint checks the dependencies the product cannot serve without. *Evidence: both endpoints, exercised locally with a dependency stopped.*
- The platform is configured to use them, with sensible timeouts. *Evidence: the deployment configuration.*
- The process shuts down gracefully: stops accepting work, finishes in-flight requests and jobs, closes connections. *Evidence: send the termination signal locally during a request.*
- A crashed instance is restarted and a failing new version does not replace a healthy one. *Evidence: platform configuration.*

## 5. Data: backups, restore and migrations

- Automated backups exist with a stated frequency and retention, and point-in-time recovery where the platform offers it. *Evidence: configuration.*
- **A restore has actually been performed.** An untested backup is a hope. Restore into a scratch instance, check the data, and record how long it took. *Evidence: the record of the test. If this cannot be done before go-live, it is a condition of release with a date.*
- Recovery objectives are stated: how much data loss and how much downtime are acceptable, and the backup design meets them. *Evidence: the numbers and the reasoning.*
- Migrations run as an explicit, ordered pipeline step, are safe to run twice, and have been run against a copy of realistic data. *Evidence: a local run from an empty database and from the previous schema.*
- Every migration in this release is backward compatible with the previous version of the code, so a rollback of the code does not need a rollback of the schema. See the `release-and-rollback` skill. *Evidence: each migration reviewed against that rule.*
- Uploaded files and other object storage are included in the backup and restore plan. *Evidence: the plan.*

## 6. Observability and alerting

- Logs are structured, carry a request or correlation id, and go somewhere they can be searched after the instance is gone. *Evidence: sample log lines from the production build.*
- Logs contain no secrets, tokens, passwords or unnecessary personal data. *Evidence: a search of sample output for known sensitive values.*
- Errors are reported to an error tracker with release and environment tags. *Evidence: a deliberately triggered test error received; verify on first deploy.*
- The key signals are measured: request rate, error rate, latency percentiles, saturation of the constrained resource (connections, memory, queue depth), and the one or two business events that mean the product is working (sign-ups completing, payments succeeding). *Evidence: where each is collected.*
- Alerts exist for the conditions a person must act on, each with a threshold, a destination a human actually reads, and a runbook entry. Few and actionable beats many and ignored. *Evidence: the alert definitions.*
- An external uptime check watches the public URL from outside the platform. *Evidence: its configuration.*

## 7. Capacity and performance

- The expected launch load is stated, and the product has been exercised at that load or the reason it could not be is given. *Evidence: the test result, or the gap.*
- The resource that runs out first is identified (database connections are the usual one), with its limit and the headroom. *Evidence: the calculation.*
- Connection pooling, timeouts and retry limits are set explicitly on every outbound call. *Evidence: configuration.*
- Rate limits protect expensive and abusable endpoints. *Evidence: where they are enforced.*
- Static assets are cached and compressed; cache headers are deliberate. *Evidence: response headers from the production build.*

## 8. Security hardening

- Security headers are set and verified on a real response: transport security, content security policy, content-type sniffing protection, framing protection, referrer policy. *Evidence: the headers, captured.*
- Cookies carry the secure attributes; cross-origin access is restricted to named origins. *Evidence: responses.*
- The service runs as a non-root user from a minimal, pinned base image; only the required ports are exposed. *Evidence: the container definition.*
- The database and internal services are not reachable from the public internet. *Evidence: network configuration.*
- Deploy credentials are scoped to the least privilege that deploys this product. *Evidence: the role or token scope.*
- Dependencies were audited for this release and CI actions are pinned to commits. *Evidence: the audit output; the pipeline.*
- The security engineer's deployment review has no open blocker or major finding. *Evidence: that document.*

## 9. Cost guardrails

- A budget alert or spending limit is set on every metered account. *Evidence: its configuration, or a go-live condition for the owner.*
- Autoscaling has an upper bound. *Evidence: configuration.*
- Anything that could be driven to unbounded cost by abuse (function invocations, bandwidth, third-party API calls, AI inference, email sending) has a limit or a rate cap. *Evidence: where it is enforced.*

## 10. Runbook completeness

The runbook is ready when someone who did not build the product could do each of these from it alone:

- deploy a new version, and verify that it worked
- roll back to the previous version
- restore the database to a point in time
- rotate each secret
- read the logs and find a specific request
- respond to each alert
- find who to contact at each vendor and where the accounts are held

*Evidence: walk through each procedure against the written steps and note any step that relies on knowledge not on the page.*

## Verdict

Finish the review with three lists: items not met that must be fixed before go-live (report these as blocker or major findings with their owner), items that can only be verified at first deployment (these become the first-deployment checklist in the runbook, each with the command that verifies it), and items accepted as risks with the reason. The boss's go / no-go decision reads these lists, so make each entry specific enough to act on.
