---
name: wireframe-spec
description: Use when designing the structure of a product before its visual design - information architecture, user flows, low-fidelity HTML wireframes with real copy, and the per-screen inventory of states - so that hierarchy and behaviour are settled before anyone chooses a typeface.
---

# Wireframe specification

Wireframes settle what is on each screen, in what order of importance, and what happens next. Settling that in grey boxes is cheap; discovering it in a finished design is expensive, and discovering it in code is how products ship with missing states. Keep visual decisions out: a wireframe that looks designed gets judged on its looks.

Everything goes under the team documents folder in `design/`: the written part in `ux.md`, the wireframes in `wireframes/`.

## 1. Users, jobs and scenarios

From the brief, PRD and research, state for each user type: who they are, the situation they are in when they arrive, what they are trying to get done, what they already know, and the device and attention they bring. Then list the scenarios the product must serve, taken from the PRD's must-have stories, including arriving for the first time and arriving the hundredth time.

## 2. Information architecture

- **Object model**: the things users think in (project, invoice, booking), their relationships, and the names users call them. Use the research's vocabulary, not the database's.
- **Site map**: every screen or page, as a tree, with the route for each.
- **Navigation model**: what is global, what is local, what is contextual; where the user is always able to get to; how they know where they are. Justify the choice against the reference study's conventions.
- **Entry points**: every way into the product (home, deep link, email, invitation, search result) and where each lands.

## 3. Flows

One flow per scenario, written as numbered steps:

```
Flow: Send first invoice (PRD stories 4, 5, 7)
Start: signed-in user with no invoices, on Home
1. Home (empty state) → primary action "Create invoice"
2. New invoice: client → [decision: existing client or new]
   2a. new → inline client form (name, email required)
3. Line items → running total visible
4. Review → "Send invoice"
5. Sent confirmation → next best action: "Create another" / "View invoice"
Failure points: 2a email invalid; 4 send fails (keep draft, say why, offer retry)
Success: invoice status Sent, visible at top of list
```

For each step ask: what decision is the user making, do they have what they need to make it, and can this step be removed, merged or deferred? Count the steps to first value and say why each remains. Mark every point where the flow can fail and what happens then.

## 4. Wireframes

One self-contained HTML file per key screen in `wireframes/`, named for the screen. Rules:

- **Structure only**: system font, greys, 1 px borders, no brand colour, no imagery, no radii or shadows. Boxes with labels for images and charts.
- **Real copy**: the actual headings, labels, button text, helper text and messages. Copy is structure. No lorem ipsum, no "Title goes here".
- **Real content shapes**: lists show a realistic number of rows with realistic lengths, including the longest plausible name and the largest plausible number.
- **Hierarchy by size, weight and position only**: if the most important thing is not obvious in greyscale, colour will not save it.
- **Responsive**: each file works at 390 and 1440 wide with a simple CSS grid, showing what reorders, collapses or disappears. Phone is not an afterthought: decide it here.
- **States in the same file**: under the main view, show the empty, loading, error and other relevant states as labelled sections, so the whole screen is reviewable on one page.
- **Annotations**: numbered notes beside the wireframe for behaviour that a picture cannot show (what a click does, validation, limits, permissions).

Start each file from:

```html
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wireframe · Screen name</title>
<style>
  body{font:16px/1.5 system-ui;margin:0;color:#222;background:#fff}
  .frame{max-width:1200px;margin:0 auto;padding:24px;display:grid;gap:16px}
  .box{border:1px solid #999;padding:16px} .ph{background:#eee;display:grid;place-items:center;min-height:160px;color:#666}
  .state{border-top:4px solid #222;margin-top:48px;padding-top:16px} .note{font-size:13px;color:#555}
  @media(min-width:900px){.cols{display:grid;grid-template-columns:2fr 1fr;gap:24px}}
</style>
```

Capture each wireframe at both widths with the site-study tool (`--no-library`) and look at the result: check that the reading order on the phone is the priority order.

## 5. State inventory per screen

For each screen, a table of every state it can be in, what triggers it, what the user sees, and what they can do: first use (empty), loading, loaded, loaded with one item, loaded with many, filtered to nothing, partial failure, total failure, no permission, signed out, limit reached, offline. Write "does not apply" where true. This table is what the staff designer designs from and what QA tests from.

## 6. Content and accessibility notes

- A content table: every heading, label, button, helper text, empty-state message, error message and confirmation, by screen. Messages say what happened and what to do next.
- Keyboard path and focus order for each screen; landmarks and heading outline; labels for every control; where focus goes after each action and when a dialog opens and closes.

## 7. Coverage

Close `ux.md` with a table mapping every must-have PRD story to its flow and screens. A story with no screen is a gap to raise with the director; a screen with no story is scope to question.

## Review yourself before handing on

- Can a new user reach the product's core value without reading instructions?
- Is there exactly one primary action per screen?
- Does every flow have its failure paths?
- Did you depart from a category convention? Say where and why the user is better off.
- Would the wireframes still make sense with all the annotations removed?
