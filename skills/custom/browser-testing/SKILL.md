---
name: browser-testing
description: Use when testing, reviewing or capturing a running web product in a real browser without a person present - starting it on the reserved port, exploring it with playwright-cli, capturing phone and desktop screenshots, checking keyboard, accessibility, console and network errors, and writing durable Playwright tests for what is worth keeping.
---

# Browser testing

Unit tests tell you the parts work. Only a real browser tells you the product works: that the page loads, the button can be reached, the form submits, the error is readable on a phone. Nobody is watching the screen during your step, so everything you learn must be captured as a screenshot, a log or a test.

## 1. Start the product

- Use the port reserved for you in the assignment (`$PORT`). Other agents are running servers at the same time; a hard-coded 3000 will collide.
- Read the README or the knowledge base for the real start command. Install dependencies first in a fresh worktree.
- Start the server in the background, write its output to a log file, and wait until it answers before testing:

```
PORT=$PORT npm run dev > /tmp/server-$PORT.log 2>&1 &
echo $! > /tmp/server-$PORT.pid
for i in $(seq 1 60); do curl -sf http://localhost:$PORT > /dev/null && break; sleep 1; done
```

- If it does not come up, read the log. A product that will not start is a blocker finding, not a reason to skip browser testing.
- Use seeded or test accounts only. Never real customer data, and never a production URL unless the assignment is a live smoke test.
- **Stop the server when you finish**: `kill $(cat /tmp/server-$PORT.pid)`. A server left running breaks the next agent that is given this port.

## 2. Capture: look before you test

Capture each key screen at desktop (1440) and phone (390) widths, with full-page and first-viewport screenshots and the measured styles:

```
node $HARNESS_HOME/tools/site-study.mjs http://localhost:$PORT/<route> --out <team documents>/qa/evidence --no-library
```

Then read the image files. Looking at the phone capture is the fastest way to find layout defects: overflow, overlapping text, unreachable controls, a desktop layout squeezed small.

## 3. Explore with playwright-cli

`playwright-cli` is on your PATH and drives a real browser from the shell, keeping the session open between commands. Run `playwright-cli --help` once to see the exact commands for this version; the usual ones open a URL, take a snapshot of the page that lists interactive elements with references, click or fill by reference, press keys, resize the viewport, take screenshots, and show console messages and network requests. Run it headless.

A useful exploration loop per flow:

1. Open the start page and take a snapshot to see what is interactive.
2. Do the flow the way a user would: click, type, submit. Snapshot after each step; screenshot anything worth keeping.
3. After each step check the console for errors and the network list for failed or unexpectedly slow requests. A red console on a page that "works" is a finding.
4. Repeat at phone width.

Beyond the happy path, for each flow:

- **Bad input**: empty, too long, wrong format, leading and trailing spaces, emoji and non-Latin text, a script tag as text, a negative or huge number.
- **Interruptions**: double-click submit, back button mid-flow, reload mid-flow, open the same thing in two tabs, let the session expire.
- **States**: first use with no data, one item, very many items, a very long name, missing image.
- **Permissions**: open a signed-in URL while signed out; open another user's object by changing the id in the URL.
- **Network**: use the browser's offline and throttling emulation if the CLI exposes it, or stop the API server; the product should say what happened and recover.

## 4. Keyboard and accessibility

- Put the mouse away: Tab through every screen. Every control reachable, in a sensible order, with a visible focus indicator; Enter and Space activate; Escape closes dialogs and returns focus to where it was.
- Run an automated check and treat violations as findings. In a Playwright test: `@axe-core/playwright`'s `AxeBuilder({ page }).analyze()`; fail on serious and critical violations.
- Zoom to 200% and narrow to 320 px: nothing is cut off or requires horizontal scrolling.
- Check that images have meaningful alternatives, form fields have labels, and errors are announced next to the field, in text.
- Emulate reduced motion and confirm animation stops.

Automated checks find perhaps a third of accessibility problems. The keyboard pass finds most of the rest.

## 5. Make it durable

Anything you checked by hand that matters goes into the product's own test suite, so it is checked on every change:

- Use the test runner the product already has. If it has none for end-to-end tests, add `@playwright/test` as a dev dependency with a config that reads the base URL from the environment and starts the product itself (`webServer`), and add a script to run it.
- Test user-visible behaviour through roles and labels (`getByRole`, `getByLabel`), not CSS classes. Wait for conditions, never for fixed times.
- One journey per test, independent of the others, creating the data it needs.
- Cover each must-have story's acceptance criteria, the main failure path of each flow, and phone width for the key screens (a second project in the config).
- Run the suite three times. A test that passes sometimes is a defect in the test or the product; find out which.

## 6. Report

- Each defect is a finding in the team's `bug-report` format, with the screenshot or failing test as evidence.
- In verification, say what you ran in a real browser, at which widths, and what you only read in code. Give test counts as numbers.
- Evidence files live in the team documents folder under `qa/evidence/` (or `design/qa/` for design QA), referenced by path.

## When the browser will not cooperate

If `playwright-cli` or the capture tool cannot launch a browser, say so in your report with the exact error, and fall back to Playwright tests run through the product's own test runner. Do not install browsers system-wide or download other automation tools. A step that could not use a browser must not claim browser verification.
