---
name: design-handoff
description: Use when writing the design system, tokens, prototype and screen specification that engineers and QA will work from - what a complete handoff contains, the token structure, the state inventory, the motion table and the acceptance criteria, so nothing has to be invented during the build.
---

# Design handoff

Generic output creeps in wherever the design is silent: an engineer facing an unspecified state reaches for a default, and defaults are how products end up looking alike. A complete handoff leaves nothing to default. The test: could an engineer who has never spoken to you build every screen, in every state, at every width, and would QA know whether they got it right?

The handoff lives under the team documents folder in `design/`:

| File | Owner | Purpose |
|---|---|---|
| `design-system.md` | staff-designer | The decisions and the reasons |
| `tokens.css` | staff-designer | The same decisions as CSS custom properties: the single source of truth |
| `prototype/` | staff-designer | Coded key screens built only from the tokens: the visual specification |
| `prototype/screenshots/` | staff-designer | Every screen at phone and desktop widths |
| `screens.md` | ux-designer | Behaviour, states, content and acceptance, screen by screen |

## design-system.md

In this order:

1. **Direction**: the thesis, the reference lock and the anti-references, carried over unchanged from the chosen direction. Every later rule should be explainable from this.
2. **Principles**: three to five, each a sentence that settles a real argument ("Data before decoration: a number is never smaller than its label").
3. **Typography**: families with source, licence, formats and how they are loaded; roles; the complete scale as a table (token, size, line height, weight, tracking, where used); rules for measure, wrapping, numerals and truncation.
4. **Colour**: primitives, then semantic roles (ground, surface, ink, muted ink, line, accent, focus, success, warning, danger, and their "on" pairs), with contrast ratios for every text and background pair in use; dark mode if the product has one; how colour may and may not carry meaning.
5. **Space and layout**: the spacing scale; the grid and container at each breakpoint; density rules; the breakpoints and what changes at each.
6. **Shape and depth**: radii, borders, shadows and the rule for when each is used.
7. **Iconography and imagery**: the icon set and its licence, sizes, stroke; the imagery policy; what is never used.
8. **Motion**: the table described below.
9. **Voice and content**: tone, naming, capitalisation, number and date formats, error-message style, with examples.
10. **Components**: for each component the product needs: purpose, anatomy, variants, sizes, every state, behaviour, accessibility notes, and do / do not. Build the inventory from the screens; do not specify components the product does not use.
11. **Do and do not**: the handful of mistakes most likely during the build, shown in pairs.

## tokens.css

Three layers, so a change of mind is one edit:

```css
:root {
  /* 1. primitives: raw values, never used directly in components */
  --slate-950: #0c0f14;
  --space-4: 1rem;

  /* 2. semantic roles: what the product means by them */
  --color-ground: var(--paper-50);
  --color-ink: var(--slate-950);
  --color-accent: var(--signal-600);
  --font-display: "…", serif;
  --text-lg: 1.25rem;  --leading-lg: 1.4;
  --radius-control: 6px;
  --duration-quick: 120ms;  --ease-out: cubic-bezier(.2, .7, .2, 1);

  /* 3. component tokens: only where a component needs its own decision */
  --button-height: 2.5rem;
}
```

Name by role, not by appearance (`--color-danger`, not `--red`). The prototype imports this file and uses nothing that is not in it; the engineers import the same file. If the product's stack needs another format (a Tailwind theme, a JSON token file), generate it from these values and say which is the source.

## Prototype

Coded, responsive, accessible HTML and CSS for every key screen, using real copy and realistic data of realistic length (the longest name, the empty list, the four-digit price). It must include the states a static mock hides. Capture every screen at phone and desktop widths into `prototype/screenshots/` with the site-study tool and `--no-library`; these captures are what design QA compares the build against.

## State inventory

For every screen and every interactive component, the handoff shows or specifies each state that can occur. Work through this list and write "does not apply" rather than leaving a gap:

- Controls: default, hover, focus-visible, active, disabled, loading, selected, error.
- Data views: loading (skeleton or progress, and after how long), empty first-use, empty after filtering, one item, many items, overflow, partial failure, total failure, stale.
- Forms: pristine, valid, invalid per field with the exact message, submitting, submitted, server error, unsaved changes on leaving.
- Access: signed out, no permission, expired session, plan limit reached.
- Environment: offline, slow network, reduced motion, 200% zoom, long translated strings, right-to-left if in scope.

## Motion table

| Element | Trigger | Property | Duration | Easing | Reduced motion |
|---|---|---|---|---|---|

Only transform and opacity animate. Each row has a reason. Anything not in the table does not move.

## Acceptance criteria

`screens.md` ends each screen with criteria QA can check without asking: what is visible at 390 and 1440 wide, which token each key element uses, the tab order, the focus treatment, the messages, and the PRD stories the screen satisfies. Close the document with a coverage table: every must-have story mapped to its screens, and every screen mapped to its prototype file. A story with no screen, or a screen with no story, is a finding.

## Before handing off

- Every colour pair in use meets WCAG 2.2 AA; tap targets are at least 44 px on touch layouts; focus is always visible.
- The prototype uses only token values. Check by reading the measured styles in the captures against `tokens.css`.
- `slop-check` passes on every screen.
- Fonts and icons are licensed for the product's use and the licences are recorded.
- Nothing in the handoff says "TBD", "etc." or "similar to".
