---
name: design-qa-loop
description: Use when comparing a built product against its design, or when reviewing whether built UI still looks and feels like the approved direction - capture the build and the prototype at the same widths, compare them element by element, judge the whole, and report deviations as actionable findings.
---

# Design QA loop

The build is where a distinctive design quietly turns generic: a spacing value rounded to the nearest default, a component library's stock button, an unspecified state filled in by habit. Design QA is the design team's job, done on the running product, and repeated until the build matches.

## 1. Capture both sides at the same widths

Start the built product on your reserved port. For every screen in the screen specification, capture the build and, if the prototype captures are missing or stale, the prototype:

```
node $HARNESS_HOME/tools/site-study.mjs http://localhost:$PORT/<route> --out <team documents>/design/qa/build --no-library
node $HARNESS_HOME/tools/site-study.mjs file://<absolute path>/prototype/<screen>.html --out <team documents>/design/qa/design --no-library
```

Each capture gives full-page and first-viewport screenshots at 1440 and 390 wide plus the measured styles. For states a URL does not reach (open menu, validation error, loading, empty), drive the build with `playwright-cli` to reach the state and screenshot it.

## 2. Compare by measurement

Read the measured styles of the build against `tokens.css`. These catch what the eye misses:

- **Typefaces**: are the specified families actually loaded and rendering, or has a fallback taken over? Check the font files list. A fallback font is the most common silent failure.
- **Type scale**: every size, weight, line height and tracking value in use should be a token. List any that is not.
- **Colour**: every colour in use should be a token value. Stray greys and near-matches mean someone typed a value.
- **Spacing and radii**: values off the scale.
- **Container width and breakpoints**: match the specification.

## 3. Compare by eye, screen by screen

Open the build and design screenshots for the same screen and width together and go through, top to bottom:

- Hierarchy: is the most important thing still the most prominent?
- Alignment and rhythm: edges, baselines, the spacing between sections.
- Each component against its specification: size, padding, radius, border, icon, label.
- Real content: long names, empty values, large numbers, wrapped headings. Does the layout hold?
- States: hover, focus-visible, active, disabled, loading, error, empty. Tab through the screen; focus must be visible and in a sensible order.
- Motion against the motion table: duration, easing, and that nothing unspecified moves. Check reduced motion.
- The phone width as its own design, not a squeezed desktop: tap-target sizes, navigation, what was dropped.

## 4. Judge the whole

Step back from the diff. Use the product for two minutes as a customer would.

- Does it feel like the direction that was approved? Re-read the thesis and hold the build against it.
- Run `slop-check` on the built screens. Drift toward generic shows up here even when each element is "close".
- Did the component library's default look leak through anywhere (stock dialogs, selects, toasts, date pickers, tables)?
- Are the details owned: selection colour, focus ring, scrollbars, form controls, favicon, page titles, the 404 and error pages?

## 5. Report

Each deviation is a finding:

- **Title**: the screen and the element ("Pricing, phone: plan cards lose the price hierarchy").
- **Details**: what the design specifies (token or value), what was built (measured value), and the fix.
- **Location**: route, width, and the screenshot file pair.
- **Severity**: blocker when it breaks use or accessibility, or when the screen reads as a generic template; major when the direction is visibly weakened (wrong typeface, wrong colour roles, broken hierarchy, missing states); minor for off-scale values and small misalignments; note for suggestions.
- **Owner**: the engineer role that should fix it. When the design itself was wrong or silent, the owner is the staff-designer: fix the design documents, say so, and file the build change as a separate finding.

Write the review document with a table of every screen: matches, deviates (with finding count), or not built. Do not write "looks good" for a screen you did not capture.

## 6. Repeat

After fixes, capture again and re-check every earlier finding plus the screens near what changed. The loop ends when no blocker or major finding remains and the whole passes step 4, not when the list is merely shorter.
