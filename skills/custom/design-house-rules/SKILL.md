---
name: design-house-rules
description: Use whenever two design skills or guidelines disagree, when a design skill tells you to stop and ask a person, or when you need the team's fixed numbers for accessibility, touch targets, motion timing, breakpoints and copy style - the team's rulings that override every other design skill.
---

# Design house rules

The team carries design skills from several authors. They are good and they disagree. This document settles the disagreements once, so that two people on the team never make opposite calls, and so that no skill's opinion silently becomes the house style. Where a skill conflicts with this document, this document wins. Where this document conflicts with the chosen direction for a product, the direction wins on matters of taste and this document wins on accessibility.

## Authority

1. The owner's stated preferences and the approved design direction.
2. The product's own design system and tokens.
3. These house rules.
4. The team's custom skills (`reference-site-study`, `design-direction`, `slop-check`, `design-handoff`, `design-qa-loop`).
5. Every other design skill, as craft advice.

No skill is "the design authority". If a skill says it must run first, must be used for all UI work, or that its defaults should be applied, treat that as its author's enthusiasm. Take its craft knowledge and leave its pipeline.

## Working unattended

Several skills pause to interview the user, present options for approval, or open a page for a human to choose. Nobody is at the keyboard during a step.

- A question the brief, the PRD, the reference study or the owner's interview already answers: answer it from there.
- A matter of professional judgement: decide, and record the decision and the reason in your document.
- A real preference only the owner can settle and that would be expensive to guess wrong: finish everything that does not depend on it, then put it in your report's questions with the options and your recommendation.
- Never install a helper tool globally, download a binary, start a telemetry-sending service, or register for an account because a skill suggests it. The capture tool and `playwright-cli` are already provided.

## Accessibility: not negotiable

- WCAG 2.2 AA. Text contrast 4.5:1 (3:1 for text 24 px and up, or 19 px bold and up); 3:1 for control boundaries, icons that carry meaning and focus indicators.
- Touch targets at least 44 by 44 CSS px on touch layouts; 24 px is the absolute floor for dense pointer-only interfaces, with spacing between targets.
- Focus is always visible, never removed, and designed (not the browser default).
- Everything works by keyboard, in a logical order; no information by colour alone; text reflows at 200% zoom and 320 px width.
- `prefers-reduced-motion` is honoured: movement becomes a fade or nothing.
- Body text is at least 16 px on phones; line length 45 to 75 characters for reading text.

## Typography

- No typeface is banned and none is default. Inter is fine when it is chosen for a reason and not carrying the whole identity alone; a fashionable alternative picked to avoid Inter is no better. The choice must be defended from the reference study and the audience.
- At most two families plus an optional one for data or code. Every size in use is on the scale.
- Display sizes get tighter tracking and line height; small text gets looser. Use tabular numerals for data and real quotation marks and apostrophes in content.
- Fonts are self-hosted, licensed for the use, subset where large, with `font-display: swap` and a metric-matched fallback so the page does not jump.

## Colour

- Roles before hues: ground, surface, ink, muted ink, line, accent, focus, and the semantic set. One accent doing one job beats three competing.
- Pure black on pure white is rarely right; neither is grey text on a tint. Check every pair.
- Light or dark follows how and where the product is used. Offer both only if both are designed.

## Layout and breakpoints

- Design the phone width and the desktop width as two designs with a rule for what happens between, not one design that shrinks.
- Breakpoints come from the content: add one where the layout breaks. Record them in the design system. When nothing else decides, use 640, 768, 1024 and 1280 px, and test at 390 and 1440.
- Spacing comes from the scale. Rhythm should vary with meaning: related things closer, sections further, not one gap everywhere.

## Motion

Where skills give different numbers, use these:

| Use | Duration | Easing |
|---|---|---|
| Hover, press, small state change | 100 to 160 ms | ease-out |
| Menus, tooltips, popovers | 150 to 220 ms | ease-out |
| Dialogs, drawers, page-level changes | 220 to 320 ms | ease-out in, ease-in out |
| Press feedback scale | 0.97 | |

- Only transform and opacity animate. Nothing loops unless it communicates ongoing work. No bounce or elastic easing unless the direction calls for playfulness and says so.
- Exits are faster than entrances. Frequent interactions get the least motion.

## Copy

- Sentence case for headings, buttons and labels, unless the direction specifies otherwise. Typographic quotes and apostrophes in content.
- Buttons say what happens ("Send invoice"), not "Submit" or "OK". Errors say what went wrong and what to do, in plain words, without blame.
- No invented numbers, customers, testimonials or awards, ever. Use real content from the brief and research, or leave a clearly marked gap and raise it as a question.
- No filler adjectives. If a sentence could describe any product, cut it.

## Components and libraries

- A component library is plumbing: behaviour, accessibility and state handling. Its default appearance is never the design. Every visible property comes from our tokens.
- Borrowed patterns from registries are redrawn in our system and their licences checked (see `design-reference-sources`).
- Icons come from one set, one stroke weight, sized on the scale. No emoji as interface icons.

## When this document is silent

Decide from the direction's thesis, make the same decision everywhere, and write it into the product's design system so the next person does not have to decide again. If the same gap appears on a second product, propose it as a lesson in your report so it can be added here.
