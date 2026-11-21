---
name: authz-review
description: Use when reviewing authentication, sessions or authorisation in any stack, during a threat model, a security review of built code, or a survey of an existing product's security model. Gives the method for enumerating every entry point and object and proving that each action enforces identity, ownership, role and tenancy on the server.
---

# Authentication and authorisation review

Broken access control is found by enumeration, not by inspiration. A reviewer who reads "the interesting files" finds the checks that exist. The vulnerabilities are the checks that do not exist, and those only show up when every entry point is listed and each one is asked the same questions.

## 1. Build the inventory first

Do not start judging until both lists are complete. Write them into your review document.

**Entry points.** Everything that accepts input from outside the trust boundary:

- HTTP routes and RPC or GraphQL operations, including each mutation and each resolver that returns an object by id
- server actions, form handlers, file upload and download endpoints
- webhooks and callbacks from third parties
- background jobs and queue consumers whose payload originated from a user
- WebSocket or server-sent-event channels and their subscribe step
- admin, internal, debug and health endpoints, and anything mounted only in some environments
- scheduled tasks that act on behalf of users

Find them from the router or framework registration, not from the documentation: route tables, decorators, file-system routing folders, schema definitions, queue subscriptions. Count them and state the count. If the framework can print its route table, use that as the source of truth.

**Objects.** Every kind of record a user can own, share or belong to: accounts, organisations or tenants, memberships, projects, documents, files, invoices, API keys, sessions, invitations, audit logs. For each, note which field ties it to an owner and which to a tenant.

## 2. Ask every entry point the same five questions

Record the answer and the file and line that proves it.

1. **Identity.** Is the caller authenticated before any work is done? Where exactly? Is the check applied by default (middleware, base class, deny-by-default router) or opted into per route? Opt-in schemes fail by omission; list every route that lacks the opt-in.
2. **Object ownership.** When the request names an object by id, does the server load it scoped to the caller (`where id = ? and owner_id = ?`) or load it by id alone and trust that the caller should have it? Loading by id alone and checking afterwards is acceptable only when the check cannot be skipped by any code path, including error paths and early returns.
3. **Role or permission.** Does the action require a role, and is the role read from server-side state at the time of the request? A role carried in a client-readable token is trustworthy only if the token is signed, verified, and short-lived enough that a demotion takes effect.
4. **Tenancy.** In a multi-tenant product, is the tenant derived from the authenticated session, never from a path segment, header, query parameter or body field that the caller controls? Is every query filtered by tenant, including joins, aggregates, search, exports and counts?
5. **Field-level control.** Which fields of the object may this caller read and write? Does the handler bind the request body straight onto the model (mass assignment), so that a caller can set `role`, `owner_id`, `tenant_id`, `is_admin`, `price` or `verified`?

An entry point passes only when all applicable questions have an answer with a location. "Probably handled by the framework" is not an answer; find where.

## 3. Sessions and tokens

- **Creation.** Session identifiers and tokens come from a cryptographically secure generator. A new session id is issued at login and at every privilege change, so a pre-login id cannot be fixed by an attacker.
- **Storage and transport.** Browser session cookies are `HttpOnly`, `Secure`, and have an explicit `SameSite` setting. Tokens are not placed in URLs, logs, error messages or analytics events.
- **Verification.** Signed tokens are verified with a pinned algorithm; the algorithm is not read from the token header. Expiry, audience and issuer are checked. Secret keys are not committed and are not the framework default.
- **Lifetime.** There is an idle and an absolute expiry. Logout, password change, and account disable invalidate existing sessions on the server, not only in the browser.
- **Recovery flows.** Password reset and email-change tokens are single use, expire, are bound to one account, and do not reveal whether an account exists. Changing the email address or password, adding a login method, creating an API key and changing roles all require recent re-authentication.
- **State-changing requests.** Cookie-authenticated mutations are protected against cross-site request forgery; token-in-header APIs are not exposed to the same risk but check that no cookie fallback exists.
- **Brute force.** Login, reset, verification-code and invitation endpoints are rate limited per account and per source.

## 4. Failure patterns to hunt for deliberately

Check each of these by name. They account for most real findings.

| Pattern | What to look for |
|---|---|
| Missing object-level check | A handler takes an id and returns or changes the object with no owner or tenant condition. Check list, export, bulk and "duplicate" endpoints especially: the single-object route is often protected while its siblings are not. |
| Trusting client-supplied identity | `user_id`, `account_id`, `tenant_id`, `role` or `price` taken from the body, query or a header and used as fact. |
| Check in the wrong layer | The UI hides a button, or the client-side router blocks a page, and the server endpoint behind it accepts anyone. |
| Confused deputy | The server fetches a URL, reads a file path, or calls an internal service using its own privileges on behalf of a caller who supplied the target. Includes server-side request forgery and webhooks that act without verifying their signature. |
| Privilege change without re-authentication | Role grants, ownership transfer, email change, key creation, or disabling a security control with only a long-lived session. |
| Horizontal versus vertical | Test both: another user at the same level (horizontal) and a lower role reaching a higher action (vertical). Reviews often cover only one. |
| Indirect references | Object reached through a parent the caller owns (`/projects/mine/files/someone-elses`), where the parent is checked and the child is not tied to it. |
| Stale authorisation | Permission cached in a token or session and not rechecked after membership was revoked. |
| Second entry | The same action exposed through a second route (legacy API version, GraphQL beside REST, admin tool, bulk import, background job) that skips the check. |
| Unauthenticated by accident | Routes excluded from middleware by a pattern that matches more than intended; static or upload paths that serve private files. |
| Invitation and sharing abuse | Invitation tokens that grant a role chosen by the invitee, do not expire, or can be redeemed by a different account than invited. |

## 5. Prove a finding before reporting it

A finding is confirmed when you can show an unauthorised actor obtaining or changing something. Read-only reasoning is a hypothesis.

1. Create two principals in a local or test environment: A and B in different tenants, or a low role and a high role. Never use real customer accounts or production data.
2. As B, create the object. Note its id.
3. As A, perform the request against B's id. Record the exact request and the response status and body.
4. For a write, re-read the object as B to show it changed.
5. Where you cannot run the product, cite the full code path from entry point to data access with file and line, and mark the finding "confirmed by code path, not executed".

Do not report a missing check on a route that is unreachable, behind a second enforced layer, or returns nothing sensitive, without saying so. A false positive costs the engineers' trust in every later finding.

## 6. Output

Put the full table in the security document named in your assignment, and the failures in your report as findings.

```
| # | Entry point | Object | Identity | Ownership | Role | Tenancy | Fields | Verdict | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PATCH /api/invoices/:id | invoice | pass (middleware/auth.ts:14) | FAIL: loaded by id only (invoices.ts:88) | n/a | FAIL | body bound to model | Vulnerable | request and response as A against B's invoice |
```

For each failing row, a finding with: severity (blocker when another tenant's or user's data can be read or changed, or a privilege gained; major when it requires an unusual precondition; minor for hardening), the location, the reproduction, the impact in one sentence, and the fix. Prefer fixes that make the mistake impossible to repeat: a data-access layer that requires the caller's scope, deny-by-default routing, an allowlist of writable fields, over a patch to one handler. Set the owner to the engineering role that should make the change.

End with the coverage statement: how many entry points exist, how many you reviewed, and which you could not review and why.
