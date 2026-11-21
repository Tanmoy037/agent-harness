---
name: codebase-survey
description: Use when mapping an existing codebase into the team's knowledge base, whether dividing it into areas, surveying one area, mapping its deployment, testing or security, assembling INDEX.md and CODEBASE.md, or refreshing a map after the code changed. Covers reading strategies that scale to very large, old, multi-language repositories and the evidence standard every claim must meet.
---

# Codebase survey

Every later agent on the team starts from the map you write instead of rediscovering the codebase. A confident but wrong sentence in it will be acted on many times, so a wrong map costs more than a slow one. Write less and be right.

## Where the map lives

Everything goes under `knowledge/` in the Team documents folder named in your assignment:

| File | Written by | Purpose |
|---|---|---|
| `inventory.md`, `inventory.json` | harness | Census of tracked files: languages, folder sizes, manifests, CI, deploy and config files |
| `areas.json` | principal engineer | The division of the codebase into areas to survey |
| `system-overview.md` | principal engineer | First reading of the whole system, before the area surveys |
| `areas/<id>.md` | staff engineers | One document per area |
| `deployment.md`, `testing.md`, `security-baseline.md` | platform, QA, security | Cross-cutting maps |
| `CODEBASE.md` | principal engineer | The full system map |
| `INDEX.md` | principal engineer | The page everyone reads first, under 200 lines |

During a survey you change no product code. You write only knowledge documents.

## Reading strategy that scales

No one reads a large repository top to bottom. Work in this order and stop descending when the question in your assignment is answered.

1. **Start from the census.** `inventory.md` tells you how big each folder is, which languages dominate, and where the build manifests, pipelines and deployment files are. Size and manifests show where the real units are before you open any source.
2. **Read what the code says about itself, as claims.** READMEs, architecture notes, CODEOWNERS, workspace and solution files, Makefiles. Documentation rots: treat each statement as a hypothesis and confirm the ones you repeat.
3. **Find the entry points.** Everything else hangs off them. Look for process mains, route and controller registrations, message and queue consumers, scheduled jobs, CLI command tables, public package exports, and for old systems: servlet and filter mappings in `web.xml`, `Global.asax`, page directories, JCL or scheduler definitions, database triggers and stored procedures. A grep for the framework's registration call is usually faster than browsing folders.
4. **Follow real flows end to end.** Pick one read, one write and one background flow and trace each from entry point to storage and back, opening every file on the path. Three traced flows teach the layering, the error handling and the data access pattern better than skimming three hundred files.
5. **Sample, state the pattern, then test the pattern.** In a folder of hundreds of similar files, read three (one old, one recent, one unusually large), write down the pattern, then check it mechanically: count files that match with a grep and open the ones that do not. Exceptions are where bugs and special cases live, so list them.
6. **Use history as a signal.** `git log --since="1 year ago" --format= --name-only -- <path> | sort | uniq -c | sort -rn | head -30` shows where change concentrates. A folder with no commits for years is either stable infrastructure or dead: say which, with the evidence (is it still imported, built, deployed?).
7. **Go deep where the owner's request lands, honest overview elsewhere.** An overview still names the boundary, the interfaces and the build and test commands.

### Subagents on large subtrees

Use subagents to read subtrees in parallel when an area is too large to read yourself. Give each a narrow question, the exact paths, and a required answer format that includes a file and symbol reference for every claim. Then verify: open a sample of the cited references yourself, and open all of them for anything the request depends on. A subagent's summary is a lead, not a finding. Never paste one into the knowledge base unchecked, because you are the one accountable for the document.

## Recognising real boundaries

Divide along boundaries the code enforces, not along the alphabet or the folder tree.

- **Build units**: packages, modules, projects, crates, assemblies. The build graph is the most reliable statement of what depends on what.
- **Deployable units**: what is packaged and released separately.
- **Data ownership**: which code writes which tables, topics and files. Two folders that both write one table are one area in practice.
- **Dependency direction**: who imports whom. A layer that everything imports is its own area and a danger zone.
- **Process, network and language boundaries**, and ownership recorded in CODEOWNERS.

Record false boundaries as danger zones: circular imports between "separate" modules, shared mutable tables, and grab-bag folders named common, shared or util that half the system reaches into.

## Unfamiliar or legacy technology

When you meet a language, framework, build system or protocol you cannot explain confidently (old ones especially: COBOL copybooks, classic ASP, WebForms, Struts, GWT, Ant or custom make systems, Perl CGI, COM components, logic in stored procedures), stop and research before describing it.

1. Establish the exact version from manifests, lockfiles, compiler flags or file headers. Old versions behave differently from current ones and most web results describe the current one.
2. Find documentation for that version: the vendor's archived docs, the language reference, the build tool manual.
3. Go back to the code and find two usages that match what you read. If they do not match, you have the wrong version or an in-house variant.
4. Write what you looked up in the area document with the link and the date, so the next person does not repeat the research.

The test of understanding: you can say in two sentences how the mechanism is used here, and predict what a specific file does before opening it.

## Evidence standard

- Every claim someone will act on carries a reference: path plus symbol, for example `billing/invoice/InvoiceService.java: finalize()`. Prefer symbols to line numbers, which drift.
- Mark how you know: **ran** (you executed it and saw the result), **read** (you read the code), **inferred** (you concluded it from names or structure). Commands in the build, run and test section must say which of them you ran and what happened.
- When you cannot tell, write "Not determined" and what would settle it. A guess written as fact is the worst thing the map can contain.
- Never write a secret value. Names and mechanisms only.

## The area document

Use exactly these sections, in this order, so every area reads the same way.

1. **Purpose**: what the area does for the product and who or what depends on it.
2. **Map**: the important folders and files with one line each; name the entry points.
3. **How it works**: the main flows end to end, with references a newcomer can follow.
4. **Data**: models, schemas, tables, queues, caches and files it owns or touches.
5. **Interfaces**: what it exposes to other areas, what it calls in them and in external services.
6. **Languages, frameworks and versions**: including anything old, unusual or in-house, with what you looked up.
7. **Build, run and test**: exact commands, and which you ran.
8. **Conventions**: naming, structure, error handling, logging, with one example file for each.
9. **Danger zones**: fragile code, hidden coupling, generated files, hot paths, things that look wrong but are intentional.
10. **Where to change what**: for the most likely kinds of change, the files to touch.
11. **Not covered**: what you did not read, and any sub-area large enough to need its own survey.

Section 11 is not an admission of failure. It is what lets the principal engineer decide whether another survey round is needed.

## INDEX.md and CODEBASE.md

**INDEX.md** is read by every agent before every task, so it must stay short (under 200 lines) and route rather than explain:

- five lines on what the product is;
- a table "if you need to change X, read Y" pointing at area documents;
- the handful of rules that apply everywhere in this codebase (the ones whose violation breaks the build, the deploy or a convention reviewers enforce);
- the essential commands to install, build, run and test.

**CODEBASE.md** is the full map: the architecture as it really is with a text diagram, each area in a paragraph with a link, how a request and a job cross areas, shared data and cross-cutting mechanisms (auth, configuration, logging, errors, feature flags), the stack with versions and age, a glossary of the product's own terms, the risk zones, and open questions for the owner. Where surveyors contradict each other, read the code and settle it; do not average two accounts.

## Mapping deployment and configuration

You are reading, not operating.

- Evidence comes from the repository: pipeline definitions, Dockerfiles and compose files, infrastructure code, platform manifests, deployment scripts, environment templates, and the code that reads configuration.
- Do not run anything that reaches real infrastructure: no cloud CLI calls, no cluster commands, no infrastructure plan or apply (a plan reads live state with real credentials), no deploy scripts, no database connections to anything but a local instance you started.
- For configuration, produce a table: setting name, where its value comes from (file, environment variable, secret store, platform setting), where the code reads it, and which environments differ.
- For secrets, record the name and the mechanism that supplies it. If you open a file that contains a real secret, do not quote it anywhere, and report its location as a finding owned by the security engineer.
- Where the repository does not say (production topology, who can deploy, what runs in which region), write "Not determined from the repository" and list it as a question for the owner in your report.

## Keeping the map current

- If you find the map wrong or missing something you needed, fix the document as part of your work and say so in your report. A map that is corrected by its users stays true.
- The harness records the commit the map was built at and, on later runs, gives the principal engineer the files changed since. Re-survey only the areas those files touch, reusing existing area ids.
- Date any claim that ages: versions, traffic, "currently unused".

## Before you report

- Every section present, with "Not determined" where true.
- Commands marked ran or not ran.
- No secret values, no product code changed.
- Weaknesses you noticed recorded as findings with a location and the role that owns the fix.
- What a second round should cover, if anything, stated in Not covered and in your handoff.
