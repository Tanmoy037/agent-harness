---
name: slop-check
description: Use before showing, handing off, accepting or shipping any designed or built screen, page or direction - a hard gate that finds the tells of generic AI-generated design (first-order and second-order looks, layout, surface, motion and content tells) and requires each hit to be fixed or justified.
---

# Slop check

Most AI-built products look alike because they are made of the same probable choices. Customers have learned to recognise the result, and they read it as "nobody cared". This check is a gate, not a style guide: a screen passes when a person who knows the tells would not think a machine assembled it, and when every remaining hit is a decision someone can defend for this product and these users.

Run it on rendered output. Capture the screen at phone and desktop widths (`node $HARNESS_HOME/tools/site-study.mjs <url> --out <dir> --no-library`), look at the screenshots, and read the measured styles in `summary.md`. Do not run it on your memory of what you built.

## The four questions first

1. Would I have produced this for any brief in this category? If yes, it fails, whatever the list below says.
2. Cover the logo and the copy. Is it still recognisably this product?
3. What will a visitor remember tomorrow? If nothing, it fails.
4. Put it beside the best three captures from the reference study. Does it belong in that company?

## First-order tells

**Typography**
- Inter, Geist, Roboto or system-ui as the whole typographic voice, chosen by default.
- One family, one or two weights, a flat hierarchy where everything is medium.
- A small tracked uppercase label (eyebrow) above every heading.
- Gradient-filled headline text. One italic serif word dropped into a sans headline.
- Monospace used as a costume for "technical".
- An oversized hero headline that says nothing specific.

**Colour**
- Purple, indigo or violet to blue gradients; purple as the accent with no brand reason.
- Soft radial glows, halos and blurred colour blobs behind content.
- Grey text on coloured or tinted surfaces; body text below 4.5:1 contrast.
- Dark mode chosen because the category is "developer" or "AI", not because of how it is used.

**Layout**
- Centred hero: headline, subhead, two buttons, screenshot or blob underneath.
- Three equal cards of icon, heading and two lines, repeated down the page.
- Everything centred; every section the same height and rhythm; a bento grid because bento is fashionable.
- Three big numbers with small labels under the hero. Numbered section labels (01, 02, 03) as decoration.
- Cards inside cards. Equal boxes for unequal content.

**Surface**
- Glass panels and backdrop blur as decoration. Uniform large radius on everything.
- A coloured stripe down one side of a rounded card. Hairline border plus wide soft shadow on every box.
- Decorative grid lines, dots or noise that carry no meaning. Hand-drawn fake browser or window chrome.
- Icons in tinted circles or rounded squares. Emoji or unicode symbols used as icons.

**Motion**
- The same fade-and-rise on every section as it scrolls in. Bounce or elastic easing.
- Auto-scrolling logo marquee. Pulsing dots. Typing cursors. Hover effects that scale whole cards.
- `transition: all`; animating layout properties; anything that moves without a reason.

**Content**
- Invented metrics, testimonials, customer logos or reviews. These are also false claims: remove them.
- "Unlock the power of", "Supercharge", "Seamlessly", "Elevate", "not just X, it's Y", and any sentence true of every product.
- "Get started" and "Learn more" as the only actions. Lorem ipsum or placeholder names anywhere.
- Stock illustration people, 3D blobs, abstract gradient art standing in for the product.
- Strings of facts joined by middle dots; piles of dashes.

**Unowned details**
- Default focus rings, text selection colour, scrollbars, form controls, link underlines and caret left as the browser ships them. Owning these is the cheapest signal that something was built rather than assembled.

## Second-order tells

Once the first list is banned, the next most probable looks appear. They are just as recognisable.

- **Warm editorial**: cream or beige ground, high-contrast serif display, terracotta or signal-red accent.
- **Neon terminal**: near-black ground, one acid green or cyan accent, glowing edges.
- **Broadsheet**: hairline rules, italic display serif, small tracked monospace labels.
- **Soft brutalism**: flat saturated colour, black outlines, hard offset shadows, heavy condensed type.
- **Reflex typefaces**: Fraunces, Playfair Display, Cormorant, Lora, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans or Instrument Serif, picked because Inter was not allowed.

None of these is forbidden in itself. Each is a hit when it was reached for rather than chosen: if the direction document cannot say why this look fits these users, with evidence from the reference study, it fails.

## Process tells

- **Reference averaging**: a little of every reference, the character of none.
- **Token drift**: the design system says one thing and the screens use other values. Compare `summary.md` against the tokens.
- **Category costume**: finance is navy, health is teal, AI is purple, eco is green, with no other idea.
- **Same as last time**: the direction matches an entry in the team's direction log.
- **Desktop-only care**: the phone capture is the desktop one, squeezed.

## Scoring and result

List every hit with the screen, what was found, and one of:

- **Fix**: say what replaces it. Removing a tell is not enough; replace it with a decision.
- **Justified**: say why it is right for this product and these users, with evidence. Being common is not a justification; being a convention users rely on (see the reference study's conventions list) is.

The screen passes when the four questions pass and no hit is left unresolved. Report the hits found and fixed as part of your verification. If you are reviewing someone else's work, report each unresolved hit as a finding owned by the staff-designer (for a design) or the engineer who built it (for a build that drifted from the design).

Do not pass your own work on the first look. Fix, capture again, and check again.
