---
name: working-in-existing-code
description: Use when changing code you did not write in an existing product, such as adding a feature, fixing a bug or reviewing a change in a codebase that has its own conventions, history and legacy parts. Covers reading before writing, following the local pattern, pinning behaviour with tests before touching legacy code, keeping the change minimal, and updating the team's knowledge documents.
---

# Working in existing code

In an existing product the code around your change is the specification you were not given. A change that works but ignores how the codebase does things creates a second way of doing them, and every later engineer pays for it. Your aim is a change a long-time maintainer would read and think was written by one of them.

## 1. Read before you write

In this order, and do not skip the neighbours:

1. `knowledge/INDEX.md` in the Team documents folder, then the area documents it routes you to for the parts you will touch. Note the conventions and danger zones listed there.
2. The files you will change, whole, plus the files next to them and one caller and one callee of the code you will touch.
3. The tests for those files. They show what the authors thought mattered and how tests are written here.
4. The last similar change: `git log --oneline -- <path>` and `git log -p -3 -- <file>`, or `git log --grep "<keyword>"`. A previous commit that added a sibling feature is the best template you will find, because it shows every file that had to change together (code, test, registration, migration, docs).

If the knowledge base has no document for where you are working, treat that as a risk: read more of the surroundings, and record a finding for the staff engineer that the area is unmapped.

## 2. Find the local pattern and follow it

Before writing anything new, find three existing examples of the same kind of thing (an endpoint, a component, a job, a migration, an error path) and work out what they share: where the file lives, how it is named, how it is registered, how it validates input, how it reports errors, how it logs, how it is tested.

- Follow the pattern even where you would have designed it differently. Consistency is worth more to the maintainers than your preference.
- If two patterns coexist, check the area document and the history for which is current. Use the newer one only if a migration is clearly under way; otherwise match the files nearest to your change. Never introduce a third.
- Reuse existing helpers. Search before writing a utility: `grep -rn "<what it does>"` over the shared folders. A duplicate helper is a defect.
- Match the formatting and lint configuration of the repository. Run its formatter on your files only.

## 3. Pin behaviour before changing legacy code

If the code you must change has no tests, or tests that do not cover the behaviour you will touch, write characterisation tests first: tests that record what the code does today, including behaviour that looks wrong.

1. Call the code with representative inputs and assert on what it actually returns or writes. Where the current behaviour looks like a bug, pin it anyway and mark it with a comment; changing it is a separate decision that is not yours to make silently.
2. If the code cannot be called from a test (hidden dependencies, global state, direct I/O), make the smallest seam that allows it: extract the logic into a function, pass a dependency as a parameter, or capture whole outputs and compare them to a saved copy.
3. Commit the characterisation tests on their own, before the change, so the review shows them passing against the old code.

Then make your change and watch which pinned tests move. Each one that changes is either the intended effect or a regression, and you must be able to say which.

## 4. Make the smallest change that fits

- Touch only what the task needs. No reformatting, renaming, reordering imports, upgrading dependencies or tidying in files you pass through. These bury the real change in the diff, and in this harness they cause merge conflicts with engineers working in parallel worktrees.
- Do not fix unrelated problems you notice. Record each as a finding with its location and an owner. Noticing them is valuable; fixing them inside this task is not.
- Before removing or "simplifying" code that looks pointless, find out why it is there: `git log -S "<snippet>"`, `git blame`, the tests, comments, linked issues. Old code that looks wrong is often holding up something you cannot see. If you still cannot tell, leave it and record a finding.
- Keep behaviour compatible unless the task says otherwise. Find every caller before changing a signature or a data shape (`grep -rn`, or the language server). For stored data and APIs use expand then contract: add the new shape, migrate readers and writers, remove the old shape in a later change.
- Generated files are changed by regenerating them, never by hand. The area document's danger zones say which they are.

## 5. Unfamiliar technology

When the code uses a language, framework version or build tool you do not know well, do not translate it into the idiom you are used to.

1. Find the exact version in the manifests and read the documentation for that version.
2. Find how this codebase uses it in two other places.
3. Try the smallest experiment that proves your understanding: run one test, build one target.
4. Note what you learned in the area document under languages and frameworks, with the link.

Guessing at an API from memory of a newer version is the most common way to break old code.

## 6. Verify the way the codebase verifies

- Run the build, lint and test commands recorded in the area document, not the ones you would expect. If they are wrong, fix the document.
- Run the tests of the code that calls what you changed, not only the tests next to your change.
- If part of the suite cannot run locally, say exactly which part and why in your report. Do not describe unrun tests as passing.
- Pre-existing failures: run the relevant tests once before you start, so you can tell failures you caused from failures that were already there. Report the pre-existing ones as findings; do not fix or delete them.

## 7. Update the knowledge documents

The map is only useful if the people who walk the ground correct it. As part of the same change:

- fix anything in the area document that was wrong or cost you time;
- add what you introduced: a new entry point, convention, command, table or external call;
- add a line to "Where to change what" if your change is a kind others will repeat.

Say in your report which knowledge documents you changed.

## Signs you are going wrong

- Your diff is several times larger than the last similar change in the history.
- You added a dependency, a base class or a folder for one feature.
- You wrote a helper without searching for one.
- You changed a test's expectation to make it pass without being able to say why the old expectation was wrong.
- You cannot name the three existing examples your code follows.

Stop and re-read when any of these is true.

## In your report

State the pattern you followed and its example files, the characterisation tests you added, the commands you ran with results, the callers you checked, the knowledge documents you updated, and every unrelated problem you noticed as a finding.
