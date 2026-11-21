import fs from 'node:fs';
import path from 'node:path';
import { HARNESS_HOME, c } from '../util.mjs';
import { banner } from '../ui.mjs';
import { DESIGN_CHOICE } from '../schemas.mjs';
import { needsHuman } from '../modes.mjs';
import { PauseRun } from '../run.mjs';
import * as memory from '../memory.mjs';

/**
 * Design happens before engineering and is held to the highest bar on the team.
 *
 * The order is deliberate: study real products that real customers use, work out the
 * experience, propose directions that are actually different from each other, let the
 * owner (or the boss) choose, and only then build the design system and screens that the
 * engineers will implement. Nothing is designed from a blank page or from habit.
 */

const MAX_DIRECTION_ROUNDS = 3;

export async function design(run) {
  const { state, modes, ui } = run;
  const D = (rel) => run.doc(`design/${rel}`);
  const P = (rel) => run.doc(`product/${rel}`);
  const studyTool = path.join(HARNESS_HOME, 'tools', 'site-study.mjs');
  const exists = (p) => fs.existsSync(run.abs(p));
  const context = [P('brief.md'), P('owner-interview.md'), P('PRD.md'), run.doc('research/market-research.md'), run.doc('marketing/positioning.md')].filter(exists);
  const knowledge = run.hasKnowledge() ? [run.doc('knowledge/INDEX.md')] : [];
  const library = memory.designLibrary({ limit: 40 });

  await run.work({
    id: 'design.research',
    role: 'ux-designer',
    title: 'Study real products and sites in this industry',
    timeoutMin: 180,
    task: `Before anyone draws anything, study how real products in this space actually look and work. Study at least 12 and preferably 20 live sites or products that real customers use: the leaders in this industry, the strongest direct competitors, and three or four products from other industries that solve a similar interaction problem unusually well. The market research lists candidates; add your own. Choose sites with real users and real revenue, not templates, concept shots or award-bait.

For every site, capture it with the study tool, which saves full-page desktop and mobile screenshots and extracts the fonts, colours, type sizes, spacing and layout the site really uses, and adds the site to the team's reference library:

    node ${studyTool} <url> --out ${run.abs(D('references'))} --industry "<industry>" [--path /pricing --path /signup ...]

Look at the screenshots yourself (read the image files) and at the extracted data; go beyond the home page to the flows that matter for our product (sign-up, onboarding, the core task, pricing, empty and error states where reachable). Then use the design reference sources described in your skills (component and pattern libraries such as 21st.dev, and curated galleries) to see how the best current work handles the specific patterns this product needs.

Write the study as analysis, not a gallery. For each site: what it is and who uses it; what it does notably well and badly; its typography, colour, density, imagery, motion and voice in concrete terms (name the typefaces, give the values); and one thing worth learning from it. Then synthesise: the conventions of this industry that users will expect and we should respect; the clichés every competitor shares and that we should leave behind; the patterns that best fit our users' jobs; and three to five opportunities to be distinctly better. Be specific enough that a designer could act on every sentence.${library.length ? `\n\nThe team has studied these sites on earlier projects; reuse what is relevant rather than starting from zero:\n${library.slice(0, 25).map((e) => `- ${e.url}${e.industry ? ` (${e.industry})` : ''}`).join('\n')}` : ''}`,
    readFirst: [...context, ...knowledge],
    deliver: [D('reference-study.md'), `${D('references/')} (one folder per site with screenshots and extracted styles)`],
  });

  await run.work({
    id: 'design.ux',
    role: 'ux-designer',
    title: 'Design the experience: flows, structure and wireframes',
    resumeFrom: 'design.research',
    task: `Design how the product works before how it looks. Deliver:

- The information architecture: every screen or page, how they are organised, and the navigation model, with the reasoning.
- The key user flows, step by step from the user's intent to success, for every must-have scenario in the PRD: first visit, sign-up or first run, the core task, returning use, and recovery when something goes wrong. Note the decision each step asks of the user and remove every step that does not earn its place.
- Low-fidelity wireframes for each key screen as simple HTML files (grey boxes and real copy, no styling decisions) that show hierarchy, content priority and responsive behaviour at phone and desktop widths.
- Content: real headings, labels, button text, helper text, empty-state and error messages. No lorem ipsum anywhere.
- The states of every interactive screen: loading, empty, partial, error, success, permission-denied, and long or missing content.
- Accessibility requirements: keyboard paths, focus order, landmarks, labels, contrast and motion preferences.

Ground each decision in the reference study and the users' jobs. Where you depart from an industry convention, say why the user is better off.${run.hasKnowledge() ? ' This is an existing product: map what exists, keep what works, and show exactly where the experience changes.' : ''}`,
    readFirst: [D('reference-study.md'), ...context],
    deliver: [D('ux.md'), `${D('wireframes/')} (one HTML file per key screen)`],
  });
  await run.commit('reference study and UX design');

  // Directions, then a choice. The owner chooses when the approvals mode gives them the design gate.
  let choice = state.get('design.choice', null);
  let feedback = null;
  for (let round = 1; !choice && round <= MAX_DIRECTION_ROUNDS; round++) {
    await run.work({
      id: `design.directions.r${round}`,
      role: 'staff-designer',
      title: round === 1 ? 'Propose three distinct design directions' : 'Propose new design directions',
      timeoutMin: 180,
      resumeFrom: round > 1 ? `design.directions.r${round - 1}` : undefined,
      feedback,
      task: `Propose three design directions for this product that are really different from one another: different in concept, typography, colour, composition and feeling, not three tints of one layout. Each must be a defensible answer to this brief, this audience and this industry, and none may look like the default output of an AI tool or a stock template.

For each direction:
- Give it a name and a one-paragraph concept: the idea, the feeling, and why it fits these users and this brand.
- Specify the typography (named typefaces with a source and licence, the scale, how headings and body differ), the colour system (with values and contrast checked), the spacing and grid, the shape and depth language, imagery or illustration approach, and how motion is used.
- Say which findings from the reference study it builds on and which industry cliché it deliberately avoids.
- Build it: a real, coded, responsive rendering of the product's most important screen (and one supporting screen) in ${D('directions/<direction-name>/index.html')}, using real copy from the UX work, real typefaces, and no placeholder content. Open it in a browser at phone and desktop widths, screenshot it into the same folder, look at the screenshots, and refine until it is as good as the best sites in the reference study. Run the slop check in your skills against it and fix what it finds.

Then write ${D('directions.md')}: the three directions side by side with their screenshots, the trade-offs of each, and your recommendation with reasons. Be honest about weaknesses.`,
      readFirst: [D('reference-study.md'), D('ux.md'), ...context],
      deliver: [D('directions.md'), `${D('directions/')} (one coded, screenshotted direction per folder)`],
    });
    await run.commit(`design directions, round ${round}`);

    if (needsHuman(modes, 'design')) {
      if (!ui.interactive) throw new PauseRun('Waiting for you to choose a design direction. Run "harness resume" in a terminal.');
      banner('Your choice: design direction');
      console.log(`The designers propose three directions. Open these in a browser:\n`);
      const dir = run.abs(D('directions'));
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir).sort()) {
          const page = path.join(dir, name, 'index.html');
          if (fs.existsSync(page)) console.log(`  ${c.cyan(name)}  ${page}`);
        }
      }
      console.log(`\nTheir comparison and recommendation: ${run.abs(D('directions.md'))}`);
      const answer = await ui.text('Which direction, and what would you change about it?', {
        hint: `Name a direction and add any changes. Start with "redo:" to reject all three and say what you want instead${round >= MAX_DIRECTION_ROUNDS ? ' (this is the last round of new directions)' : ''}. "stop" pauses the run.`,
      });
      if (!answer || /^(stop|pause|quit|exit)$/i.test(answer)) throw new PauseRun('Paused at the design direction choice. Run "harness resume" when you are ready.');
      memory.remember('owner', `Design direction feedback: ${answer}`, { run: state.id, project: path.basename(run.projectDir), source: 'owner' });
      if (/^redo\b/i.test(answer) && round < MAX_DIRECTION_ROUNDS) {
        feedback = `The owner rejected all three directions and said:\n"""\n${answer.replace(/^redo:?\s*/i, '')}\n"""\nPropose three new directions that answer this. Do not resubmit variations of the rejected ones.`;
        continue;
      }
      choice = { by: 'owner', text: answer };
    } else {
      const decision = await run.decide({
        id: `design.choice.r${round}`,
        title: 'Choose the design direction',
        schema: DESIGN_CHOICE,
        schemaName: 'design_choice',
        task: `The designers propose three directions. Open the rendered screenshots in each direction's folder and read the comparison. Choose the one that best serves these users and this brief and that a customer would not mistake for a generic template. Name it exactly, give your reasoning, and state any changes you want. You may combine elements only if the result stays coherent.`,
        readFirst: [D('directions.md'), D('reference-study.md'), ...context],
      });
      choice = { by: 'boss', text: `${decision.choice}. ${decision.reasoning}${decision.changes_requested ? ` Changes requested: ${decision.changes_requested}` : ''}` };
    }
  }
  state.set('design.choice', choice);
  if (choice.by === 'owner') {
    state.data.gates.design = { approved: true, by: 'owner', at: new Date().toISOString() };
    state.save();
  }
  const chosen = `The ${choice.by} chose the design direction:\n"""\n${choice.text}\n"""`;

  await run.work({
    id: 'design.system',
    role: 'staff-designer',
    title: 'Build the design system and key screens',
    timeoutMin: 240,
    resumeFrom: state.get('last.design.staff-designer'),
    task: `${chosen}

Turn the chosen direction, with the requested changes, into the design the engineers will build. Deliver:

- ${D('design-system.md')}: the principles in a few sentences each; typography (families, sources, the full scale with sizes, line heights, weights and usage); colour (every token with its value, role and contrast pairs, including dark mode if the product has one); spacing, grid and breakpoints; radius, borders, elevation; iconography and imagery rules; motion (durations, easings, what moves and why, reduced-motion behaviour); and every component the product needs with its anatomy, variants, sizes and all states (default, hover, focus, active, disabled, loading, error).
- ${D('tokens.css')}: the same decisions as CSS custom properties, the single source of truth that the prototype uses and the engineers will import.
- ${D('prototype/')}: coded, responsive, accessible HTML and CSS for every key screen in the UX design, built only from the tokens and components, with real copy and realistic data, including the empty, loading and error states. This is the visual specification: an engineer should be able to match it exactly.
- Screenshots of every prototype screen at phone and desktop widths in ${D('prototype/screenshots/')}.

Work the way a design lead does: build, look at the result in a browser, compare it against the best sites in the reference study, critique it with your skills, and refine. Repeat until it would not look out of place beside them. Check contrast, focus visibility, tap-target sizes and text wrapping at every width. Run the slop check on every screen before you finish.`,
    readFirst: [D('directions.md'), D('ux.md'), D('reference-study.md'), ...context, ...knowledge],
    deliver: [D('design-system.md'), D('tokens.css'), D('prototype/')],
  });

  await run.work({
    id: 'design.spec',
    role: 'ux-designer',
    title: 'Write the screen-by-screen specification',
    resumeFrom: 'design.ux',
    task: `The design system and prototype are done. Write the specification an engineer and a tester will work from, screen by screen: purpose; the content and components on it, referring to the design system by name; behaviour of every interactive element; all states and what triggers each; validation rules and the exact messages; responsive behaviour at each breakpoint; keyboard and screen-reader behaviour; and the analytics events the PRD calls for. Link each screen to its prototype file and to the PRD stories it satisfies, and list any story that no screen covers.

While you do this, review the prototype against your UX design. Where it lost something users need, record a finding for the staff designer with the screen and the problem.`,
    readFirst: [D('design-system.md'), D('prototype/'), D('ux.md'), P('PRD.md')],
    deliver: [D('screens.md')],
  });
  await run.commit('design system, prototype and screen specification');

  await run.reviewLoop('design', {
    title: 'Design',
    artifacts: [D('design-system.md'), D('screens.md'), D('prototype/'), D('directions.md'), D('reference-study.md'), P('PRD.md')],
    guidance: `Open the prototype screenshots and look at them. Judge three things. First, would a customer in this industry take this for a product made with care by people who understand them, or for a generic AI-generated template? If any screen looks like the latter, send it back to the staff-designer and say which screen and what makes it generic. Second, does it serve every must-have story in the PRD, including the unhappy paths? Third, is it complete and precise enough that engineers can build it without inventing anything? ${chosen}`,
  });
}
