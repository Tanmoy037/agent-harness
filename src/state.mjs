import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, timestampId, slug, HarnessError } from './util.mjs';

/**
 * Everything the harness keeps inside a product folder lives under `.harness/`:
 *
 *   .harness/config.json            the modes chosen for this product
 *   .harness/memory/project.jsonl   what the team knows about this product
 *   .harness/runs/<id>/state.json   one run: every step, its result and its session id
 *   .harness/runs/<id>/logs/        raw agent transcripts
 *   .harness/worktrees/             one git worktree per engineering task
 *
 * A run is resumable: a finished step is never executed twice.
 */

export const harnessDir = (projectDir) => path.join(projectDir, '.harness');
export const configFile = (projectDir) => path.join(harnessDir(projectDir), 'config.json');
export const runsDir = (projectDir) => path.join(harnessDir(projectDir), 'runs');

export const loadProjectConfig = (projectDir) => readJson(configFile(projectDir), {});
export const saveProjectConfig = (projectDir, config) => writeJson(configFile(projectDir), config);

export function listRuns(projectDir) {
  const dir = runsDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, 'state.json')))
    .sort()
    .map((name) => readJson(path.join(dir, name, 'state.json')));
}

export function latestRun(projectDir) {
  return listRuns(projectDir).at(-1) ?? null;
}

export class RunState {
  constructor(projectDir, data) {
    this.projectDir = projectDir;
    this.data = data;
    this.dir = path.join(runsDir(projectDir), data.id);
    this.file = path.join(this.dir, 'state.json');
  }

  static create(projectDir, { request, modes, docsDir }) {
    const id = `${timestampId()}-${slug(request, 28)}`;
    const state = new RunState(projectDir, {
      id,
      request,
      modes,
      docsDir,
      status: 'running',
      phase: null,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      baseBranch: null,
      branch: null,
      steps: {},
      values: {},
      gates: {},
      events: [],
    });
    state.save();
    return state;
  }

  static load(projectDir, id) {
    const file = path.join(runsDir(projectDir), id, 'state.json');
    if (!fs.existsSync(file)) throw new HarnessError(`No run "${id}" in ${projectDir}`);
    return new RunState(projectDir, readJson(file));
  }

  save() {
    this.data.updated = new Date().toISOString();
    writeJson(this.file, this.data);
  }

  get id() {
    return this.data.id;
  }

  logFile(stepId) {
    return path.join(this.dir, 'logs', `${stepId.replace(/[^a-zA-Z0-9._-]+/g, '_')}.jsonl`);
  }

  step(id) {
    return this.data.steps[id] ?? null;
  }

  setStep(id, patch) {
    this.data.steps[id] = { ...(this.data.steps[id] ?? {}), ...patch };
    this.save();
    return this.data.steps[id];
  }

  /** Small named values a phase needs to remember across a restart (answers, choices, loop counters). */
  get(key, fallback = undefined) {
    return key in this.data.values ? this.data.values[key] : fallback;
  }

  set(key, value) {
    this.data.values[key] = value;
    this.save();
  }

  event(type, detail = {}) {
    this.data.events.push({ at: new Date().toISOString(), type, ...detail });
    this.save();
  }

  setStatus(status, extra = {}) {
    Object.assign(this.data, { status, ...extra });
    this.save();
  }

  totals() {
    const steps = Object.values(this.data.steps);
    return {
      steps: steps.length,
      done: steps.filter((s) => s.status === 'done').length,
      failed: steps.filter((s) => s.status === 'failed').length,
      costUsd: steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
      durationMs: steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0),
    };
  }
}
