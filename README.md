# Agent harness

A software company of AI agents. A boss (Codex, or Claude Fable when Codex is not available) researches, decides what to build, coordinates everyone and is the final check at every stage. Claude Opus agents design, architect, build, test, secure and ship. Everything runs at high effort through the `codex` and `claude` CLIs on your own subscriptions.

```
harness run "A booking site for an independent yoga studio"
```

## The team

| Role | Engine | Does |
|---|---|---|
| Boss | Codex / Claude Fable | Interviews you, writes the PRD, reviews every phase, accepts or rejects the product, go / no-go, retrospective |
| Market researcher, marketing lead, sales lead | Codex / Claude Fable | Market and competitor research with sources, positioning, launch plan, sales kit |
| UX designer | Claude Opus | Studies 12 to 20 real products in the industry, flows, wireframes, content, screen specification |
| Staff product designer | Claude Opus | Three distinct directions, design system, tokens, coded prototype, design QA of the build |
| Principal engineer | Claude Opus | Architecture, scalability, decisions; leads the survey of an existing codebase |
| Staff engineer | Claude Opus | Surveys codebase areas, task plan for parallel work, code review of every task, integration |
| Senior engineers (several in parallel) | Claude Opus | Build each task test-first in its own git worktree |
| Principal QA, staff QA | Claude Opus | Test strategy and gates; tests at every level, real-browser testing, whole-product verification |
| Security engineer | Claude Opus | Threat model, code and deployment review, research into what is being exploited now |
| Staff platform engineer | Claude Opus | Chooses hosting, builds CI/CD and infrastructure, deploys after go-live approval |

`harness team` lists every role with its skills.

## What a run does

1. **Understand the existing product** (only when the folder already has code). The principal engineer divides the codebase into areas; staff engineers survey the areas in parallel; platform, QA and security map deployment, testing and security; the principal assembles a knowledge base in `knowledge/`; the boss is briefed and can send them back. Later runs refresh only what changed. `harness survey` runs this phase alone.
2. **Interview.** The boss researches the industry, then asks you its questions in the terminal.
3. **Research and requirements.** Market research, PRD, a challenge of the PRD by engineering and UX, positioning.
4. **Design.** Reference study of real sites, UX and wireframes, three coded directions, your choice, design system and prototype, screen specification, boss review.
5. **Architecture and plan.** Architecture, test strategy, threat model, deployment plan, and a task graph.
6. **Build.** Tasks run in parallel worktrees; each is code-reviewed before it merges.
7. **Verify.** QA, security and design QA examine the whole product; the boss accepts it or sends fix tasks back; repeat.
8. **Launch material.** Launch plan and sales kit.
9. **Release.** Delivery pipeline, deployment security review, go / no-go, your approval, deploy, live smoke test.
10. **Retrospective.** The boss turns what happened into lessons the team keeps.

Work happens on a branch named `harness/<run-id>` (your branch is not touched), and the team's documents are written to `docs/` (or `docs/team/` when the product already has a `docs` folder).

## Modes

You choose these at the start of a run; flags skip the questions and `--defaults` uses the saved ones.

| Mode | Flag | Choices |
|---|---|---|
| Boss | `--boss` | `codex`, `claude` (Fable) |
| Your approval points | `--approvals` | `design-golive` (default), `every-phase`, `golive-only`, `autonomous` |
| Agent access to this machine | `--access` | `guarded` (default), `bypass`, `strict` |
| Product type | `--type` | `web-app`, `marketing-site`, `mobile-app`, `backend` (comma separated) |
| Codebase survey | `--survey` | `auto` (default), `always`, `never` |
| Parallel engineers | `--engineers` | 1 to 8 |
| Business specialists | `--business` | `true`, `false` |

**Access modes.** In every mode agents cannot read your SSH, cloud or CLI credentials or use `sudo`. Pushing, publishing and deploying are blocked until go-live is approved (by you, or by the boss in `autonomous`).
- `guarded`: Claude's automatic permission mode; routine work runs, risky actions are refused.
- `bypass`: no permission checks beyond the rules above.
- `strict`: file edits plus a fixed list of commands.

## Commands

```
harness run "<request>"        start a run in the current folder
harness resume [run-id]        continue a paused, interrupted or failed run
harness status                 phase, steps, time and cost of the latest run
harness survey                 map an existing codebase only
harness ask <role> "<task>"    one task for one team member
harness team | team build      list roles; rebuild role folders
harness skills list|install|audit
harness memory [scope]         what the team has learned;  harness memory forget <id>
harness stats                  quality trend across runs
harness retro [run-id]         run the retrospective for a run that did not reach it
harness doctor                 check CLIs, logins and tools
```

Add `--project <dir>` to work on a folder other than the current one. A run can be interrupted with Ctrl-C at any time; finished steps are never repeated.

## How it gets better

- **Lessons per role, team lessons, your preferences, product facts** are stored as plain JSON-lines files under `memory/` (product facts under `<product>/.harness/memory/`) and placed in every agent's assignment.
- Only two things write lessons: your own words at an approval point (stored verbatim) and the boss's retrospective, which works from the factual record of the run: what reviews sent back, what QA and security found, what failed.
- A lesson seen again is counted rather than duplicated, so confirmed lessons rise to the top; wrong ones are retired.
- The designers' **reference library** (`memory/design/library.jsonl`) and **direction log** (`memory/design/directions.md`) grow with every product, so later products start from more evidence and do not converge on one look.
- A recurring procedure can become a **learned skill** in `skills/learned/` (you are asked first when you are at the terminal).
- `harness stats` shows first-pass approval rates, verification rounds and blockers per run.

Everything the team learns is a file you can read, edit or delete, and is committed to this repository's history when it is a git repository.

## Skills

Each role carries its own curated set, visible only to that role's sessions.

- `skills/vendor/`: open-source skills, copied unmodified at a pinned commit from the repositories in `skills/sources.json`, with licences. See `skills/THIRD_PARTY.md`.
- `skills/custom/`: written for this team where no adequate open-source skill existed (reference site study, design direction, slop check, codebase survey, task breakdown, quality gates, acceptance review, and others).
- `skills/learned/`: written by the team after retrospectives.

`team/roles.json` assigns skills to roles. After editing it, run `harness team build`. `harness skills audit` scans every skill for patterns worth a human look.

The team handbook (`team/handbook.md`) puts the team's rules above any skill: no sign-ups, no installing by piping a download into a shell, no telemetry, no skipping confirmations.

## Layout

```
bin/harness.mjs          entry point
src/                     orchestrator: modes, permissions, runners, phases, memory
team/roles.json          roles, engines and skill assignments
team/prompts/, handbook  role instructions
skills/                  vendor, custom, learned
tools/site-study.mjs     captures a page at desktop and phone widths and measures its fonts, colours and spacing
memory/                  what the team has learned (created on first use)
build/                   generated per-role folders (not committed)
```

In a product folder the harness keeps `.harness/` (run state, transcripts, worktrees, product memory), excluded from git locally.

## Setup

```
cd tools && npm install        # browser tooling (Playwright); uses the Chrome already installed
node bin/harness.mjs doctor
npm link                       # optional: makes `harness` available everywhere
```

Requires Node 20+, git, the `claude` CLI logged in, and the `codex` CLI logged in (optional: without it the boss runs on Claude Fable).

Optional settings go in `harness.config.json` at the root, for example `{ "options": { "stepTimeoutMin": 120, "reviewRounds": 2, "verifyLoops": 3, "maxAreas": 16, "surveyRounds": 2 } }`. Models are set in `team/roles.json` under `engines`; the Codex model is left unset so it follows your Codex configuration.

## Testing the harness itself

```
npm test
```

runs unit tests and a full pipeline with stand-in agents (`HARNESS_FAKE_AGENTS=1`): no model is called, but git, worktrees, merge conflicts, review loops, approval pauses, resume and memory are exercised for real.

## Cost and limits

A full run is many long sessions at high effort. Parallel engineers multiply the rate at which your Claude subscription limit is used; if a limit is hit the run pauses and `harness resume` continues it later.
