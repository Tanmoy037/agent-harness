import fs from 'node:fs';
import path from 'node:path';
import { HARNESS_HOME, c, truncate, formatDuration, writeJson, Semaphore, Mutex, HarnessError } from './util.mjs';
import { banner, info, ok, warn, fail } from './ui.mjs';
import { getRole, resolveEngine, claudeRoleDir, codexRoleDir } from './team.mjs';
import { claudePermissions, codexPermissions, agentEnv } from './permissions.mjs';
import { runClaude } from './runners/claude.mjs';
import { runCodex, writeSchemaFile } from './runners/codex.mjs';
import { WORK_REPORT, REVIEW, ANSWERS } from './schemas.mjs';
import { needsHuman, describeModes } from './modes.mjs';
import * as memory from './memory.mjs';
import { commitAll } from './git.mjs';

/** The run cannot continue right now, but nothing is lost: `harness resume` picks it up. */
export class PauseRun extends Error {}

const LIMIT_PATTERN = /(usage|session|weekly|rate)[ -]limit|hit your limit|quota|overloaded|too many requests/i;
const MAX_QUESTION_ROUNDS = 2;

const DEFAULT_OPTIONS = {
  stepTimeoutMin: 120,
  surveyTimeoutMin: 240,
  reviewRounds: 2,
  verifyLoops: 3,
  codeReviewRounds: 2,
  intakeRounds: 3,
  surveyRounds: 2,
  maxAreas: 16,
  staggerMs: 4000,
  quiet: false,
};

/**
 * One run of the team on one request. Phases call `work` (an agent does something and
 * reports) and `decide` (the boss returns a decision). Both are memoised in the run
 * state, so a resumed run continues from the first unfinished step.
 */
export class Run {
  constructor({ projectDir, state, team, modes, ui, options = {} }) {
    this.projectDir = projectDir;
    this.state = state;
    this.team = team;
    this.modes = modes;
    this.ui = ui;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    // Claude sessions share the subscription limit; starts are staggered to avoid burst throttling.
    this.claudeSlots = new Semaphore(modes.engineers + 2, this.options.staggerMs);
    this.codexSlots = new Semaphore(3, 1500);
    this.gitLock = new Mutex();
    this.portCounter = 0;
    this.docsDir = state.data.docsDir;
  }

  /** Path of a team document, relative to the product folder (this is what agents are told). */
  doc(rel) {
    return path.posix.join(this.docsDir, rel);
  }

  abs(rel) {
    return path.join(this.projectDir, rel);
  }

  docExists(rel) {
    return fs.existsSync(this.abs(this.doc(rel)));
  }

  hasKnowledge() {
    return this.docExists('knowledge/INDEX.md');
  }

  log(msg) {
    if (!this.options.quiet) console.log(msg);
  }

  // ---------------------------------------------------------------- prompts

  buildPrompt(spec, role, engine, cwd, port) {
    const lines = [
      `# Assignment: ${spec.title}`,
      '',
      `You are the ${role.title} on this team. Run id: ${this.state.id}.`,
      '',
      `- Product folder: ${this.projectDir}`,
      `- Your working directory: ${cwd}`,
      `- Team documents: ${this.abs(this.docsDir)} (paths below are relative to the product folder unless absolute)`,
      `- Harness tools: ${path.join(HARNESS_HOME, 'tools')}`,
      `- Port reserved for you: ${port} (use it for any local server you start, and stop the server when you finish)`,
    ];
    if (engine.kind === 'codex') {
      lines.push('- Your shell starts in your role folder, not the product folder. Use absolute paths under the product folder for everything you read or write.');
    }
    lines.push('', '## What the owner asked for', this.state.data.request.trim());

    if (this.hasKnowledge() && !spec.skipKnowledge) {
      lines.push(
        '',
        '## Existing product',
        `This is an existing codebase. The team's map of it is in ${this.doc('knowledge/')}. Read ${this.doc('knowledge/INDEX.md')} before anything else, then the area documents it points to for the parts you will touch. Follow the conventions recorded there. If you find the map wrong or missing something you needed, fix the relevant knowledge document as part of your work and say so in your report.`,
      );
    }

    lines.push('', '## Your task', spec.task.trim());
    if (spec.readFirst?.length) lines.push('', '## Read first', ...spec.readFirst.map((p) => `- ${p}`));
    if (spec.deliver?.length) lines.push('', '## Deliver', ...spec.deliver.map((p) => `- ${p}`));
    if (spec.feedback) lines.push('', '## Feedback to address', spec.feedback.trim());

    if (spec.memory !== false) {
      const recalled = memory.recall({ role: role.id, projectDir: this.projectDir });
      if (recalled) lines.push('', recalled);
    }

    lines.push('', '## Run settings', describeModes(this.modes));
    if (spec.kind === 'decision') {
      lines.push('', '## Reporting', 'This is a decision. Do not change any files. Return your decision in the required format, grounded in what you actually read.');
    } else {
      lines.push(
        '',
        '## Reporting',
        'Finish with your report in the required format, as described in the team handbook: what you did, the files you wrote, what you verified and how, findings, lessons, and what the next person needs to know.',
      );
    }
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- execution

  async invoke(spec, role, engine, prompt, { resume, cwd, port, attempt }) {
    const stepId = spec.id;
    const logFile = this.state.logFile(attempt ? `${stepId}.retry${attempt}` : stepId);
    const tag = c.dim(`[${role.id}]`);
    const onActivity = this.options.quiet ? undefined : (line) => console.log(`${tag} ${c.dim(line)}`);
    const timeoutMs = (spec.timeoutMin ?? this.options.stepTimeoutMin) * 60_000;
    const schema = spec.schema ?? WORK_REPORT;
    // Credentials and git push only reach the approved deploy step.
    const baseEnv = agentEnv({ goliveUnlocked: Boolean(spec.goliveUnlocked) });
    const env = {
      HARNESS_HOME,
      HARNESS_PROJECT: this.projectDir,
      HARNESS_DOCS: this.abs(this.docsDir),
      HARNESS_RUN: this.state.id,
      HARNESS_MEMORY_DIR: memory.MEMORY_DIR,
      PORT: String(port),
      // playwright-cli and the other browser tools the harness ships are on the agents' PATH.
      PATH: `${path.join(HARNESS_HOME, 'tools', 'node_modules', '.bin')}${path.delimiter}${baseEnv.PATH ?? ''}`,
    };

    // Test mode: exercise the orchestration without calling any model.
    if (process.env.HARNESS_FAKE_AGENTS) {
      const { runFake } = await import('./runners/fake.mjs');
      return runFake({ spec, role, cwd, projectDir: this.projectDir });
    }

    if (engine.kind === 'claude') {
      const perms = claudePermissions({
        access: this.modes.access,
        goliveUnlocked: Boolean(spec.goliveUnlocked),
        readOnly: spec.kind === 'decision',
      });
      const settingsFile = path.join(this.state.dir, 'settings', `${stepId.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`);
      writeJson(settingsFile, perms.settings);
      return this.claudeSlots.run(() =>
        runClaude({
          prompt,
          cwd,
          model: engine.model,
          effort: engine.effort,
          pluginDir: claudeRoleDir(role.id),
          systemPromptFile: path.join(claudeRoleDir(role.id), 'system-prompt.md'),
          permissionMode: perms.permissionMode,
          settingsFile,
          schema,
          resume,
          addDirs: [...new Set([this.projectDir, path.join(HARNESS_HOME, 'tools'), memory.MEMORY_DIR])].filter((d) => d !== cwd && fs.existsSync(d)),
          env,
          baseEnv,
          logFile,
          onActivity,
          timeoutMs,
        }),
      );
    }

    const perms = codexPermissions({ access: this.modes.access, write: spec.kind !== 'decision' });
    const schemaFile = writeSchemaFile(path.join(this.state.dir, 'schemas'), spec.schemaName ?? (spec.schema ? stepId.replace(/[^a-zA-Z0-9]+/g, '_') : 'work_report'), schema);
    return this.codexSlots.run(() =>
      runCodex({
        prompt,
        roleDir: codexRoleDir(role.id),
        projectDir: this.projectDir,
        model: engine.model || undefined,
        effort: engine.effort,
        sandbox: perms.sandbox,
        network: perms.network,
        schemaFile,
        resume,
        env,
        baseEnv,
        logFile,
        onActivity,
        timeoutMs,
      }),
    );
  }

  /** Run one step to a structured result, with one retry and the question-answer loop. */
  async exec(spec) { // synup-ignore: method name, not eval/exec
    const done = this.state.step(spec.id);
    if (done?.status === 'done') return done.report;

    const role = getRole(this.team, spec.role);
    const engine = resolveEngine(this.team, role, this.modes);
    const cwd = engine.kind === 'codex' ? codexRoleDir(role.id) : (spec.cwd ?? this.projectDir);
    const port = 4100 + (this.portCounter++ % 80) * 10;
    const started = Date.now();
    const label = `${c.bold(role.title)} ${c.dim('·')} ${spec.title}`;
    this.log(`${c.cyan('▶')} ${label}`);

    let resume = null;
    if (done?.sessionId && done.engine === engine.kind) resume = done.sessionId; // interrupted step: pick the session back up
    else if (spec.resumeFrom) {
      const prev = this.state.step(spec.resumeFrom);
      if (prev?.sessionId && prev.engine === engine.kind) resume = prev.sessionId;
    }
    this.state.setStep(spec.id, { status: 'running', role: role.id, title: spec.title, engine: engine.kind, startedAt: new Date().toISOString() });

    let prompt = this.buildPrompt(spec, role, engine, cwd, port);
    if (done?.sessionId && resume === done.sessionId) {
      prompt = `The harness was interrupted while you were working on this assignment. Check what you already completed, finish the rest, and return your report.\n\n${prompt}`;
    }

    let res;
    let cost = 0;
    let questionRounds = 0;
    for (let attempt = 0; ; attempt++) {
      res = await this.invoke(spec, role, engine, prompt, { resume, cwd, port, attempt });
      cost += res.costUsd ?? 0;
      if (res.sessionId) this.state.setStep(spec.id, { sessionId: res.sessionId });

      if (!res.ok || !res.structured) {
        const error = res.error ?? 'the agent finished without the required report';
        if (LIMIT_PATTERN.test(error)) {
          this.state.setStep(spec.id, { status: 'paused', error });
          throw new PauseRun(`${role.title} hit a usage or rate limit: ${truncate(error, 200)}`);
        }
        if (attempt >= 1) {
          this.state.setStep(spec.id, { status: 'failed', error, durationMs: Date.now() - started, costUsd: cost });
          fail(`${label} — ${truncate(error, 200)}`);
          throw new HarnessError(`Step "${spec.id}" failed: ${error}\nTranscript: ${this.state.logFile(spec.id)}`);
        }
        warn(`${role.title}: ${truncate(error, 160)} — retrying once`);
        if (res.sessionId) {
          resume = res.sessionId;
          prompt = `Your previous turn ended without the required report (${truncate(error, 200)}). Continue from where you stopped, finish the assignment, and return the report in the required format.`;
        }
        continue;
      }

      // An agent may stop to ask. The boss answers what it can; the owner is asked only what only they can decide.
      const report = res.structured;
      if (spec.kind !== 'decision' && report.status === 'needs_input' && report.questions?.length && questionRounds < MAX_QUESTION_ROUNDS) {
        questionRounds++;
        const answers = await this.answerQuestions(role, spec, report.questions, questionRounds);
        resume = res.sessionId;
        prompt = `Answers to your questions:\n\n${answers}\n\nContinue the assignment with these answers and return your report. If something is still unknown, choose the most reasonable option, record the assumption in your report, and finish.`;
        attempt = -1; // answering questions is not a failed attempt
        continue;
      }
      break;
    }

    const report = res.structured;
    const durationMs = Date.now() - started;
    this.state.setStep(spec.id, {
      status: 'done',
      report,
      sessionId: res.sessionId,
      endedAt: new Date().toISOString(),
      durationMs,
      costUsd: cost,
      denials: res.denials?.length ? res.denials : undefined,
    });
    const phase = spec.id.split('.')[0];
    this.state.set(`last.${phase}.${role.id}`, spec.id);

    const summary = report.summary ?? report.understanding ?? '';
    ok(`${label} ${c.dim(`(${formatDuration(durationMs)}${cost ? `, ~$${cost.toFixed(2)}` : ''})`)}`);
    if (summary) this.log(c.dim(`  ${truncate(summary, 220)}`));
    if (report.status === 'blocked') warn(`${role.title} reports it is blocked: ${truncate(report.handoff || summary, 200)}`);
    if (res.denials?.length) this.log(c.dim(`  ${res.denials.length} action(s) were refused by the access rules`));
    return report;
  }

  /** An agent does work and reports. */
  work(spec) {
    return this.exec({ kind: 'work', ...spec }); // synup-ignore: method name, not eval/exec
  }

  /** The boss (or another role) returns a decision without changing anything. */
  decide(spec) {
    return this.exec({ role: 'boss', kind: 'decision', ...spec }); // synup-ignore: method name, not eval/exec
  }

  /** Run steps in parallel. All are allowed to finish (and be saved) before the first failure is raised. */
  async all(thunks) {
    const settled = await Promise.allSettled(thunks.map((fn) => fn()));
    const failed = settled.find((s) => s.status === 'rejected');
    if (failed) throw failed.reason;
    return settled.map((s) => s.value);
  }

  commit(message, dir = this.projectDir) {
    return this.gitLock.run(() => commitAll(dir, `[team] ${message}`));
  }

  // ---------------------------------------------------------------- collaboration

  async answerQuestions(role, spec, questions, round) {
    const list = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    let answered = [];
    let forOwner = questions;

    if (role.id !== 'boss') {
      const decision = await this.decide({
        id: `${spec.id}.questions.r${round}`,
        title: `Answer questions from the ${role.title}`,
        schema: ANSWERS,
        schemaName: 'answers',
        task: `The ${role.title} stopped work on "${spec.title}" to ask:\n\n${list}\n\nAnswer every question you can from the brief, the PRD, the team documents and your own judgment as the person accountable for the product. Put a question in ask_owner only when it is a real preference or business decision that only the owner can make and that a wrong guess would make expensive. Do not escalate what a competent product manager would simply decide.`,
        readFirst: [this.doc('product/brief.md'), this.doc('product/PRD.md')].filter((p) => fs.existsSync(this.abs(p))),
      });
      answered = decision.answers ?? [];
      forOwner = decision.ask_owner ?? [];
    }

    const out = answered.map((a) => `Q: ${a.question}\nA (from the boss): ${a.answer}`);
    for (const question of forOwner) {
      let answer = '';
      if (this.ui.interactive) {
        answer = await this.ui.text(`${role.title} asks: ${question}`, { hint: 'Enter to let the team decide.' });
      }
      if (answer) {
        memory.remember('project', `Owner decision — ${truncate(question, 200)} → ${truncate(answer, 300)}`, {
          projectDir: this.projectDir,
          run: this.state.id,
          source: 'owner',
        });
        out.push(`Q: ${question}\nA (from the owner): ${answer}`);
      } else {
        out.push(`Q: ${question}\nA: The owner has not answered. Choose the most reasonable option and record it as an assumption.`);
      }
    }
    return out.join('\n\n');
  }

  /**
   * The boss reviews a phase. On "revise", each named role gets the instructions and
   * reworks its output, then the boss reviews again, up to the configured rounds.
   */
  async reviewLoop(phase, { title, artifacts = [], guidance = '', ownerFeedback = null, idSuffix = '' }) {
    let review;
    for (let round = 1; round <= this.options.reviewRounds; round++) {
      review = await this.decide({
        id: `${phase}.review${idSuffix}.r${round}`,
        title: `Review: ${title}${round > 1 ? ` (round ${round})` : ''}`,
        schema: REVIEW,
        schemaName: 'review',
        task: [
          `Review the team's work for: ${title}.`,
          guidance,
          ownerFeedback
            ? `The owner reviewed this and said:\n"""\n${ownerFeedback}\n"""\nTreat that as binding. Turn it into precise revision instructions for the right roles; your verdict must be "revise" unless the feedback needs no change.`
            : '',
          'Read the documents and, where it matters, the actual product files. Judge against the brief and PRD, the owner\'s stated preferences, and the quality bar in your role description. Approve only work you would put your name on.',
          'If you send work back, name the role and give specific, checkable instructions: what is wrong, where, and what "fixed" looks like. Do not ask for revisions that are matters of taste with no consequence.',
          round === this.options.reviewRounds ? 'This is the last review round for this phase: approve if the remaining issues are minor and list them under risks, otherwise revise.' : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        readFirst: artifacts,
      });
      this.state.event('review', { phase, round, verdict: review.verdict, revisions: review.revisions?.length ?? 0 });
      if (review.verdict === 'approve' || !review.revisions?.length) return { ...review, verdict: 'approve' };

      this.log(c.yellow(`↺ Boss sent ${review.revisions.length} item(s) back: ${truncate(review.summary, 160)}`));
      const byRole = new Map();
      for (const r of review.revisions) byRole.set(r.role, [...(byRole.get(r.role) ?? []), r.instructions]);
      await this.all(
        [...byRole.entries()].map(([roleId, items]) => () =>
          this.work({
            id: `${phase}.revise${idSuffix}.r${round}.${roleId}`,
            role: roleId,
            title: `Revise after review: ${title}`,
            resumeFrom: this.state.get(`last.${phase}.${roleId}`),
            task: `The boss reviewed "${title}" and sent the following back to you. Address every point, updating your documents and files in place, then verify the result.`,
            feedback: items.map((t, i) => `${i + 1}. ${t}`).join('\n'),
            readFirst: artifacts,
          }),
        ),
      );
      await this.commit(`revisions after review: ${title}`);
      ownerFeedback = null; // already turned into instructions
    }
    warn(`Review of "${title}" still has open points after ${this.options.reviewRounds} rounds; continuing and recording them as risks.`);
    this.state.event('review-unresolved', { phase, summary: review.summary });
    return review;
  }

  /**
   * An approval point. If the chosen approvals mode gives this gate to the owner, the run
   * waits for them; their feedback goes back through the boss as revisions. Otherwise the
   * boss's own review stands.
   */
  async gate(gate, { phase, title, summary, artifacts = [] }) {
    if (!needsHuman(this.modes, gate)) return { approved: true, by: 'boss' };
    if (this.state.data.gates[gate]?.approved) return this.state.data.gates[gate];

    for (let round = 1; ; round++) {
      if (!this.ui.interactive) {
        this.state.data.gates[gate] = { approved: false, waiting: true };
        this.state.save();
        throw new PauseRun(`Waiting for your approval: ${title}. Run "harness resume" in a terminal to review it.`);
      }
      banner(`Your approval: ${title}`);
      if (summary) console.log(summary.trim());
      if (artifacts.length) {
        console.log(`\n${c.bold('Look at:')}`);
        for (const a of artifacts) console.log(`  ${this.abs(a)}`);
      }
      const answer = await this.ui.text('Type "yes" to approve, "stop" to pause the run, or say what should change.', { fallback: '' });
      if (/^(y|yes|approve|approved|ok|lgtm)$/i.test(answer)) {
        this.state.data.gates[gate] = { approved: true, by: 'owner', at: new Date().toISOString(), rounds: round };
        this.state.save();
        this.state.event('gate', { gate, approved: true, round });
        return this.state.data.gates[gate];
      }
      if (!answer || /^(stop|pause|quit|exit)$/i.test(answer)) {
        throw new PauseRun(`Paused at your approval point: ${title}. Run "harness resume" when you are ready.`);
      }
      // The owner's own words are the most valuable thing the team can learn from.
      memory.remember('owner', `At ${title}: ${answer}`, { run: this.state.id, project: path.basename(this.projectDir), source: 'owner' });
      this.state.event('gate', { gate, approved: false, round, feedback: answer });
      const review = await this.reviewLoop(phase, { title, artifacts, ownerFeedback: answer, idSuffix: `.owner${round}` });
      summary = review.note_to_owner || review.summary || summary;
    }
  }
}

export { DEFAULT_OPTIONS };
