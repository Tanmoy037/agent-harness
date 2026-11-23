import fs from 'node:fs';
import { c, writeText } from '../util.mjs';
import { banner, info } from '../ui.mjs';
import { INTAKE } from '../schemas.mjs';
import { hasUI } from '../modes.mjs';

/**
 * Intake: the director interviews the owner before anything is decided.
 * Discovery: market research, the product spec, and a challenge of that spec by the
 * people who will have to design and build it.
 */

function renderTranscript(transcript) {
  if (!transcript.length) return 'No questions have been asked yet.';
  return transcript.map((t) => `Q: ${t.question}\nA: ${t.answer || '(no answer: decide and record the assumption)'}`).join('\n\n');
}

export async function intake(run) {
  const { state, ui, options } = run;
  const P = (rel) => run.doc(`product/${rel}`);
  const transcript = state.get('intake.transcript', []);
  const knowledge = run.hasKnowledge() ? [run.doc('knowledge/INDEX.md'), run.doc('knowledge/CODEBASE.md')] : [];

  for (let round = 1; round <= options.intakeRounds; round++) {
    const decision = await run.decide({
      id: `intake.questions.r${round}`,
      title: round === 1 ? 'Understand the request and prepare the interview' : 'Decide whether more needs to be asked',
      schema: INTAKE,
      schemaName: 'intake',
      task: `You are about to commit a whole team to this request, so first make sure you understand it. Research the industry and the kind of product on the web until you know who the real users are, who the established players are, and what usually goes wrong, so that your questions are the ones an expert in this industry would ask.

Then decide what you must ask the owner. ${round === 1 ? 'Ask generously in this first round: 8 to 15 questions.' : 'Ask only follow-ups whose answers would change what gets built: at most 6.'} Cover what is still unknown among: the business and industry; who the users are and what they are trying to get done; what success looks like and how it will be measured; competitors and products the owner admires or dislikes, and why; the look and feel they want, with real sites or products as reference points, and what they consider generic or ugly; the must-haves for a first version and what is explicitly out; content, data and integrations that already exist; constraints (deadline, budget, compliance, technology, hosting); and what would make them say "this is extraordinary" rather than "this is fine".

Each question must be specific and answerable in a sentence or two; give the reason you are asking in "why", and offer options only where a short list of choices really helps (otherwise an empty array). Do not ask what you can find out or sensibly decide yourself, and do not ask the owner to do your job ("what features do you want?" is not a question, "should invoices support multiple currencies in v1?" is).

Set ready to true, with an empty question list, only when you could write a brief the owner would recognise as exactly what they meant. Record in "assumptions" what you are deciding yourself.

Interview so far:
${renderTranscript(transcript)}`,
      readFirst: knowledge,
    });

    if (decision.ready || !decision.questions?.length) break;
    if (state.get(`intake.answered.r${round}`)) continue;

    banner(round === 1 ? 'The director has questions before the team starts' : 'A few follow-up questions');
    console.log(decision.understanding.trim());
    if (!ui.interactive) {
      info('No terminal is attached, so the director will decide these itself and record its assumptions.');
      for (const q of decision.questions) transcript.push({ round, question: q.question, answer: '' });
      state.set('intake.transcript', transcript);
      state.set(`intake.answered.r${round}`, true);
      break;
    }
    console.log(c.dim('\nAnswer briefly. Press Enter on any question to let the team decide.'));
    for (const [i, q] of decision.questions.entries()) {
      const hint = [q.why ? `Why: ${q.why}` : '', q.options?.length ? `Options: ${q.options.join(' / ')}` : ''].filter(Boolean).join('\n');
      const answer = await ui.text(`${i + 1}/${decision.questions.length}  ${q.question}`, { hint });
      transcript.push({ round, question: q.question, answer });
      state.set('intake.transcript', transcript);
    }
    state.set(`intake.answered.r${round}`, true);
  }

  // The owner's exact words are kept verbatim; the brief is the director's reading of them.
  writeText(
    run.abs(P('owner-interview.md')),
    `# Owner interview\n\nThe owner's request and answers, verbatim. This outranks every other document when they disagree.\n\n## Request\n\n${state.data.request.trim()}\n\n## Questions and answers\n\n${renderTranscript(transcript)}\n`,
  );

  await run.work({
    id: 'intake.brief',
    role: 'director',
    title: 'Write the product brief',
    resumeFrom: `intake.questions.r1`,
    task: `Write the brief that every person on the team will read first. It must let a designer, an engineer and a tester each understand what is being built, for whom, and why, without having been in the interview.

Include: the product in one paragraph; the owner's goal and how success will be measured; the users and the job each is trying to get done; the industry context a newcomer needs; the scope of this effort and what is explicitly out; the look, feel and references the owner gave, quoted where they were specific; constraints; your assumptions, each marked as an assumption; and open risks. Where the owner did not answer, decide, and say that you decided.${run.hasKnowledge() ? ' This is a change to an existing product: say what exists today, what changes, and what must not change.' : ''}

Write it to be read, not filed: plain language, no filler.`,
    readFirst: [P('owner-interview.md'), ...knowledge],
    deliver: [P('brief.md')],
  });
  await run.commit('product brief');
}

export async function discovery(run) {
  const { modes } = run;
  const P = (rel) => run.doc(`product/${rel}`);
  const brief = [P('brief.md'), P('owner-interview.md')];
  const ui = hasUI(modes);

  if (modes.business) {
    await run.work({
      id: 'discovery.market-research',
      role: 'market-research',
      title: 'Research the market, competitors and users',
      task: `Give the team an evidence-based picture of the market this product enters. Use live web research and cite every factual claim with its source and date; separate what you found from what you infer.

Cover: the market and its size (with the method and its weaknesses); the customer segments and which one to win first, and why; the jobs users are trying to get done and where today's options fail them, using real user voices (reviews, forums, communities) where you can find them; the direct and indirect competitors, each with positioning, pricing, strengths, weaknesses and what users complain about; pricing norms; trends and regulation that matter in the next two years; and the gaps a new entrant could own.

End with what this means for the product: the five to ten findings that should change what the team builds, and the bets you would not make. Also list 15 to 25 real, live products and sites in or near this space that real customers use, with URLs and one line on what each does well: the designers will study them.`,
      readFirst: brief,
      deliver: [run.doc('research/market-research.md')],
    });
  }

  const research = fs.existsSync(run.abs(run.doc('research/market-research.md'))) ? [run.doc('research/market-research.md')] : [];
  const knowledge = run.hasKnowledge() ? [run.doc('knowledge/INDEX.md')] : [];

  await run.work({
    id: 'discovery.prd',
    role: 'director',
    title: 'Write the product requirements',
    task: `Write the product requirements document the whole team will build from and that you will later accept or reject the work against. Decide; do not list options.

Include: the problem and the evidence for it; goals and measurable success criteria; non-goals; the users and their key scenarios; the requirements as numbered user stories, each with acceptance criteria that a tester can check without asking you (given / when / then, with concrete values); priority for each (must, should, could) and what is deliberately cut from this version; the principal user journeys from first touch to success, including first-run, empty, error and edge cases; content and data requirements; quality requirements (performance, accessibility, security, privacy, supported devices and browsers) with numbers; analytics and success measurement; dependencies and risks with mitigations; and the release criteria: what must be true to ship.

Be ambitious about quality and disciplined about scope: a smaller product that is excellent beats a larger one that is generic. Every requirement must trace to the brief, the research or a decision you state.`,
    readFirst: [...brief, ...research, ...knowledge],
    deliver: [P('PRD.md')],
  });

  // The people who must design and build it challenge the spec before it is final.
  await run.all([
    () =>
      run.work({
        id: 'discovery.prd-challenge.engineering',
        role: 'principal-engineer',
        title: 'Challenge the requirements: feasibility and risk',
        task: `Read the draft requirements as the engineer who will be held to them. Find what is ambiguous, contradictory, missing, untestable, technically risky, or far more expensive than its value justifies${run.hasKnowledge() ? ', and what collides with how the existing product actually works' : ''}. For each point say what the problem is, why it matters, and what you propose instead. Say what you would cut to make the first version excellent. Do not redesign the product; sharpen it.`,
        readFirst: [P('PRD.md'), ...brief, ...knowledge],
        deliver: [P('prd-review-engineering.md')],
      }),
    ...(ui
      ? [
          () =>
            run.work({
              id: 'discovery.prd-challenge.ux',
              role: 'ux-designer',
              title: 'Challenge the requirements: users and experience',
              task: `Read the draft requirements as the advocate for the people who will use this. Find where a journey has a gap, where a requirement serves the business but not the user, where a state is missing (first run, empty, loading, error, offline, permission denied), where the scope forces a mediocre experience, and where accessibility or content has been forgotten. For each point say what the problem is, who it hurts, and what you propose. Keep it short and specific.`,
              readFirst: [P('PRD.md'), ...brief, ...research],
              deliver: [P('prd-review-ux.md')],
            }),
        ]
      : []),
  ]);

  await run.work({
    id: 'discovery.prd-final',
    role: 'director',
    title: 'Finalise the requirements',
    resumeFrom: 'discovery.prd',
    task: `Engineering${ui ? ' and UX' : ''} have challenged your draft. Decide each point: accept it and change the document, or reject it and record why in a short "Decisions" section at the end. Then make the document final: consistent, numbered, and testable throughout.`,
    readFirst: [P('PRD.md'), P('prd-review-engineering.md'), ...(ui ? [P('prd-review-ux.md')] : [])],
    deliver: [P('PRD.md')],
  });

  if (modes.business) {
    await run.work({
      id: 'discovery.positioning',
      role: 'marketing',
      title: 'Define positioning and messaging',
      task: `Define how this product is positioned and how it speaks, so that design and copy are built on it rather than on placeholder text.

Deliver: the positioning statement (for whom, the problem, the category, the difference that matters, the proof); the three to five messages in priority order, each with the evidence behind it; the voice and tone with examples of sentences that are on-voice and off-voice; the words the audience actually uses, taken from the research; real headline, subhead and call-to-action options for the main surfaces; and the claims you must not make. Ground everything in the research and the PRD; no superlatives that could be said of any product.`,
      readFirst: [P('PRD.md'), ...brief, ...research],
      deliver: [run.doc('marketing/positioning.md')],
    });
  }

  await run.commit('product requirements');
  await run.gate('spec', {
    phase: 'discovery',
    title: 'Product requirements',
    summary: 'The director has written the product requirements, and engineering and UX have challenged them.',
    artifacts: [P('PRD.md'), P('brief.md'), ...research],
  });
}
