---
name: implementing-designs
description: Use when building or fixing any user interface from the team's design system, tokens, prototype and screen specification, and the result must match the design exactly instead of drifting toward a default component-library look. Covers tokens as the single source of values, component states, responsive checks, screenshot comparison against the prototype, and what to do where the design is silent.
---

# Implementing designs

The designers studied real products, chose a direction with the owner, and built a prototype to that standard. The most common way the product loses that quality is during implementation: a default radius here, a library's stock button there, a guessed spacing value, and the result looks like every other generated interface. Your job is to reproduce the design, not to interpret it.

## Sources and which one wins

All under `design/` in the Team documents folder:

| Source | Authority for |
|---|---|
| `tokens.css` | Every value: colours, type sizes, weights, line heights, spacing, radii, shadows, durations, easings, breakpoints |
| `design-system.md` | Rules and components: anatomy, variants, sizes, states, when to use what |
| `prototype/` and its screenshots | How each screen looks, at phone and desktop widths |
| `screens.md` | Behaviour: what each element does, all states, validation and messages, responsive and keyboard behaviour |

When two sources disagree, follow the tokens and the prototype for appearance and the screen specification for behaviour, and record the disagreement as a finding owned by the staff designer. Do not settle it silently in either direction.

## Set up so that drift is impossible

1. **Import the tokens, never copy them.** Load `tokens.css` once at the root. If the stack has its own theme mechanism (a utility-CSS theme, a styled-system theme object), define the theme by referencing the custom properties, so there is still one place where a value lives. A value typed by hand into a component is a value that will not follow the design when it changes.
2. **Load the specified typefaces** from the source the design system names, with the weights it lists and a fallback stack with similar metrics. A missing font file silently replaces the design's typography with the system default, which changes the character of the whole product.
3. **Forbid raw values in components.** After each piece of work, check: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]+px" <ui source folder>` and account for every hit. Legitimate exceptions are rare (a one-pixel border, an asset dimension) and should carry a comment.

## Component libraries

A headless or unstyled library is welcome for behaviour and accessibility (focus management, keyboard handling, dialogs, menus). Its styling must come entirely from the tokens.

A styled library's default theme must never reach the screen. If the stack uses one, restyle every component used to match the design system, then look specifically for the defaults that leak: the library's radius, shadow, focus ring, font stack, spacing scale, primary colour, and transition timing. If matching the design would mean fighting the library on every component, say so in your handoff rather than shipping the library's look.

## Build each screen in this order

1. **Structure**: semantic elements, headings in order, landmarks, real form labels. Take the structure from the prototype's markup.
2. **Layout**: grid and spacing from tokens. Compare block positions with the prototype before styling anything else.
3. **Typography**: family, size, weight, line height, letter spacing, measure (line length). Check headings and body separately.
4. **Colour and surface**: backgrounds, borders, shadows, by token role (not by nearest-looking value).
5. **States**: see the list below.
6. **Motion**: durations and easings from tokens, only on what the design system says moves, and the reduced-motion behaviour.
7. **Responsive behaviour**: each breakpoint in the specification.
8. **Content extremes**: see below.

## States are part of the design

For every interactive component implement each state the design system defines: default, hover, focus-visible, active or pressed, disabled, loading, error, selected. For every screen implement: loading, empty, partial, error, success, and permission-denied where it applies. A missing state is a defect even when the default looks perfect, because the missing states are where users actually get stuck.

Focus must be visible on every interactive element when navigating by keyboard, in the style the design specifies. Never remove an outline without replacing it.

## Responsive checks

Check at the widths the design names and at these: 360, 390, 768, 1024, 1280 and 1440 pixels, and also at a width between each pair of breakpoints, because layouts usually break between the sizes someone designed for. At each width confirm: no horizontal scrolling, no clipped or overlapping text, wrapping that reads well, tap targets large enough for a thumb on touch widths, images that keep their aspect ratio, and navigation that still works.

## Content extremes

The prototype shows typical content. Try the screen with: a very long name and a very long unbroken word, the shortest possible content, no items, one item, many items, a missing image, a number with many digits, and text set to 200 percent zoom. The layout must hold. Where it does not and the design gives no rule, apply the rule from "When the design is silent".

## Compare the build with the prototype

Do not judge the match from the code. Capture both and look.

```
# the product on your reserved port, and the prototype served from the team documents
python3 -m http.server $((PORT+1)) --directory "$HARNESS_DOCS/design/prototype" &

node "$HARNESS_HOME/tools/site-study.mjs" "http://localhost:$PORT/<route>" --out /tmp/compare/build --no-library
node "$HARNESS_HOME/tools/site-study.mjs" "http://localhost:$((PORT+1))/<screen>.html" --out /tmp/compare/prototype --no-library
```

The tool saves full-page screenshots at desktop and phone widths and the fonts, colours, sizes and spacing each page actually uses. List the output folders to see the files. `--no-library` keeps local pages out of the designers' reference library. The harness reserves a block of ports starting at `$PORT`, so `PORT+1` is yours to use.

Then:

1. Open the two screenshots for the same screen and width and read them as images, side by side.
2. Compare in order: overall layout and proportions, typography, spacing rhythm, colour, component detail, imagery and icons.
3. Compare the extracted style data: the build should report the same font families, the same set of font sizes and the same colours as the prototype. An extra size or colour in the build is a value that did not come from the tokens.
4. Fix and capture again until every remaining difference is one you can explain (real data in place of sample data, for example).

Stop the servers you started when you finish.

## When the design is silent

In this order:

1. Find the same component or situation elsewhere in the prototype and do what it does.
2. Apply the rule in the design system (spacing scale, type scale, colour roles).
3. Compose the closest analogous pattern from existing tokens and components.
4. Never introduce a new colour, font, size, radius or shadow, and never fall back to a browser or library default.

Record what was missing and what you chose as a finding owned by the staff designer, severity minor or note, and continue. Only when an entire screen or flow has no design should you stop: report status needs_input with the specific question, because inventing a screen is the designers' work.

## What makes a build look generic

Check that none of these crept in: default blue links and browser form controls, a library's stock shadow and radius, emoji used as icons, stock or placeholder images, placeholder or lorem text, centred everything, uniform spacing where the design has rhythm, system font where a typeface was specified, and animations on everything.

## In your report

Say which screens you compared and at which widths, what differences remain and why, the result of the raw-value check, which states you implemented, and every gap in the design as a finding. Include the paths of the comparison screenshots.
