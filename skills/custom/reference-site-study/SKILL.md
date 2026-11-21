---
name: reference-site-study
description: Use when starting any design work, before proposing a direction, layout or style - to study 12 to 20 real, live products that real customers use, capture and measure them, tear each one down, and synthesise what the category expects, what it has worn out, and where this product can be distinct.
---

# Reference site study

Design that starts from a blank page comes out as the average of everything the designer has ever seen. Design that starts from close study of real products comes out specific. This study is how the team earns its opinions: every later design decision should be traceable to something observed here.

The study is of **live products with real customers**, opened and measured, not of galleries, concept shots or memory. Galleries only supply names.

## 1. Build the reference set (12 to 20)

Fill this grid. Record for each entry why it was chosen; "it is popular" is not a reason.

| Slot | How many | What belongs here |
|---|---|---|
| Category leaders | 3 to 5 | The products most customers in this industry already use. They define what users expect. |
| Direct competitors | 3 to 5 | Whoever the customer would choose instead of us, including the ones the owner named. |
| Challengers | 2 to 3 | Newer products winning on experience. They show where the category is moving. |
| Adjacent | 2 to 3 | Products in a neighbouring category solving the same interaction problem (scheduling, comparison, onboarding, dense data). |
| Out of category | 3 or more | Chosen for one specific quality we want: a typographic voice, a way of showing proof, a calm dense table, a memorable first screen. These keep the direction from being the category average. |

Sources for names: the market research document, the owner's interview answers (their admired and disliked products are mandatory entries), web search for the category's leaders, software review sites' category pages, and one or two gallery category pages (see `design-reference-sources`). Check the team's reference library in the assignment and reuse relevant earlier captures instead of redoing them.

Reject: templates and theme demos, agency concept work, sites with no evidence of real users, and anything you cannot open.

## 2. Capture each one

For every reference, run the capture tool. It behaves like an ordinary visitor and adds the site to the team's reference library.

```
node $HARNESS_HOME/tools/site-study.mjs <url> --out <team documents>/design/references \
  --industry "<industry>" --path /pricing --path /signup
```

Add `--path` for the pages that matter to our product: pricing, sign-up, a feature page, a docs or help page, a public demo. For logged-in products, capture what is public (marketing site, sign-up flow up to the account wall, public demo, help-centre screenshots, product tour) and say what you could not see. Never create accounts with fake identities and never try to get past a login or a bot check; a blocked site is recorded as blocked and replaced.

Then **look**. Read the screenshot image files (`*-desktop.png`, `*-mobile.png`, the `-fold` versions for the first viewport) and read `summary.md` for the measured values. The measurements stop you from guessing ("it uses a serif" becomes "Tiempos Headline 56/60 at weight 400, body Inter 16/26"). The screenshots tell you what the measurements mean.

For interaction and motion that a screenshot cannot show, drive the page with `playwright-cli`: hover the primary controls, open the navigation, tab through the first screen, submit an empty form, resize between phone and desktop.

## 3. Tear each one down

One sheet per reference in the study document, using exactly these headings so sheets can be compared:

- **What it is / who uses it**: one line each, and why it is in the set.
- **First viewport**: what a visitor sees before scrolling, the single message, where the primary action is.
- **Structure**: the page anatomy in order; the navigation model; how deep the product goes.
- **Typography**: the typefaces by name and role; the real size scale; weights; line height; measure; anything distinctive (tight tracking on display sizes, optical sizes, a mono for data).
- **Colour**: the ground, the ink, the accent and how much of the screen each occupies; how colour carries meaning; contrast problems.
- **Space and shape**: density, the spacing rhythm, container width, radii, borders versus shadows.
- **Imagery and proof**: real product shots, illustration, photography, data; real customer names and numbers versus generic claims.
- **Motion and interaction**: what moves and why; hover, focus, loading, empty and error behaviour where reachable.
- **Voice**: headline length and tone; how it names things; three verbatim examples.
- **Mobile**: what changes at phone width, what is dropped, what breaks.
- **Verdict**: what works for its users, what is weak, the **one thing worth borrowing** and the **one thing to avoid**.

Write what you observed, with values. Two specific sentences beat a paragraph of adjectives.

## 4. Synthesise

The sheets are evidence; the synthesis is the product of the study. End the document with:

1. **Category conventions** (keep): things most references share because users rely on them: where pricing lives, how the main object is listed, what the sign-up asks for. Departing from these costs users effort; do it only with a reason.
2. **Category clichés** (leave behind): things most references share out of habit, which make them interchangeable: the same hero composition, the same palette, the same stock claims. Name each precisely.
3. **Open territory**: three to five concrete opportunities to be distinct in a way these users would value, each tied to evidence ("no competitor shows real output before sign-up", "every tool in the category is cold blue; the audience is craft businesses").
4. **Patterns for our key flows**: for each must-have flow in the PRD, the best handling you saw and where.
5. **Candidate primary references**: two or three references, at least one from outside the category, that could anchor a direction, and what each would bring.
6. **What we could not study** and how that limits the conclusions.

## Quality check before you finish

- At least 12 references captured and torn down, at least three from outside the category, every one a live product.
- Every sheet contains named typefaces and measured values, not impressions.
- You looked at the phone captures, not only desktop.
- The clichés list would let a reviewer reject a generic design by pointing at it.
- No conclusion rests only on gallery pages.
- Source URL and capture date are recorded for every reference (the tool writes them to `summary.md`).

Borrow structure, pattern and proportion. Never copy another product's brand assets, copy, illustrations or code.
