---
name: design-direction
description: Use when proposing, comparing or committing to a visual direction for a product - after the reference study and before any design system or screen work - to produce directions that are distinct from each other, from the category average, and from the team's own previous products.
---

# Design direction

A direction is a decision about what this product is in the world, expressed as type, colour, space, shape, imagery, motion and voice. It is not a mood, and it is not a palette. This skill produces three directions that are worth choosing between, then turns the chosen one into a contract the rest of the work is held to.

## Why directions come out generic, and what to do about it

Left alone, a model picks the most probable choice at every step: the familiar sans, the centred hero, the card grid, the safe accent. Banning those is not enough, because the second most probable choice takes their place and becomes just as recognisable (see `slop-check` for the second-order looks). Three things break the pattern:

1. **Start from evidence.** Every direction is anchored in the reference study and in who the users are, not in the product category's stereotype.
2. **Lock a primary reference.** Averaging several references produces a featureless mean. Each direction names one primary reference whose logic it follows, borrows at most two specific details from others, and says what it rejects.
3. **State the risk.** Each direction says which category conventions it keeps and which deliberate departure a visitor will remember. A direction with no departure is not a direction.

The test: could someone guess this aesthetic from the product category alone, or from the category plus "avoid the obvious"? If yes, rework it.

## Before proposing

- Re-read the owner's own words about look and feel, and the clichés and open territory in the reference study.
- Read the team's direction log at `$HARNESS_MEMORY_DIR/design/directions.md` if it exists. It lists what this team has shipped before. A new product must not reuse a previous product's typefaces, palette and layout logic together; the team's work converging on one house look is the failure this skill exists to prevent.
- Write down the usage context: device, frequency, attention, environment. A tool used eight hours a day and a page visited once want different things; light or dark, dense or airy follow from use, not from category.

## Three directions

Make them differ in concept, not in tint. A useful way to force real spread is to give each a different primary reference from a different slot of the reference set (a category leader, a challenger, an out-of-category reference) and a different answer to "what should this feel like to use".

For each direction, write the contract:

- **Name** and **thesis**: one paragraph. What the product is in this direction, the feeling, and the default it refuses.
- **Reference lock**: primary reference and what is preserved from its logic; up to two borrowed details and from where; what is explicitly rejected; why this fits these users.
- **Own world**: what makes it recognisable with the content removed (a type voice, a colour relationship, a grid habit, a shape language, a way of showing data).
- **Typography**: named families with source and licence; roles (display, text, data); the scale; one sentence on why these faces for this audience. Choose with evidence (`design-reference-sources`), never by reflex.
- **Colour**: ground, ink, accent and semantic roles with values; proportions (how much of a screen is each); contrast checked.
- **Layout and density**: grid, container, rhythm, how hierarchy is made.
- **Shape and depth**: radii, borders, shadows, or their absence.
- **Imagery**: real product, data, photography, illustration, or none; and what is never used.
- **Motion**: what moves, why, and how fast; what never moves.
- **Voice**: three example headlines and one button label in this direction's voice.
- **Safe choices and risks**: conventions kept; the departures; the one thing a visitor will remember.
- **Weaknesses**: where this direction could fail, honestly.

## Build each direction for real

A direction that has not been rendered is a guess. For each one, code the product's most important screen and one supporting screen as responsive HTML and CSS in its own folder: real copy from the UX work, the real typefaces loaded, real content shapes, no placeholders. Then:

1. Capture it at phone and desktop widths with the site-study tool (`--no-library`) and look at the screenshots.
2. Put it beside the captures of the best references. Does it hold up? If it is visibly weaker, keep working.
3. Run `slop-check` on it and fix every hit.
4. Check contrast, text wrapping at both widths, and that the first viewport says one clear thing.

Iterate each at least twice. The first render is the probable one; the craft is in the revisions.

## Comparison document

Present the three side by side: screenshots, the thesis of each in two sentences, what each is best and worst at for these users, and your recommendation with reasons. Make it possible to choose in five minutes. If two directions look like siblings, you have two directions, not three: replace one.

## After the choice

The chosen direction, with the requested changes, becomes the contract for the design system. Carry forward the thesis, the reference lock and the anti-references into the design system document unchanged, so that every later decision can be checked against them.

Then append to `$HARNESS_MEMORY_DIR/design/directions.md` (create it if missing) so the next product starts from different ground:

```
## <date> · <product> · <industry>
Thesis: <one sentence>
Type: <families>   Colour: <ground / ink / accent values>   Layout: <one line>
Primary reference: <name>   Chosen by: <owner or director>   Owner's reaction: <their words, if any>
```
