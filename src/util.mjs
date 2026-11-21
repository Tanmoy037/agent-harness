import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_HOME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw new Error(`Could not read JSON from ${file}: ${err.message}`);
  }
}

/** Write via a temp file and rename, so a crash never leaves a half-written state file. */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

export function readText(file, fallback) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export const exists = (p) => fs.existsSync(p);

export function slug(s, max = 48) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'x'
  );
}

export function timestampId(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function truncate(s, n = 100) {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

/** Counting semaphore with an optional minimum gap between starts, to avoid burst throttling. */
export class Semaphore {
  constructor(limit, staggerMs = 0) {
    this.limit = Math.max(1, limit);
    this.staggerMs = staggerMs;
    this.active = 0;
    this.queue = [];
    this.lastStart = 0;
  }

  async run(fn) {
    if (this.active >= this.limit) await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      const wait = this.lastStart + this.staggerMs - Date.now();
      this.lastStart = Math.max(Date.now(), this.lastStart + this.staggerMs);
      if (wait > 0) await sleep(wait);
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/** Serialises async work, for example git operations on one checkout. */
export class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  run(fn) {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

/** Parse `--key value`, `--key=value` and `--flag` into { _: positionals, ...options }. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (eq !== -1) {
      out[key] = a.slice(eq + 1);
    } else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = argv[++i];
    }
  }
  return out;
}

export class HarnessError extends Error {}
