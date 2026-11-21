import readline from 'node:readline';
import { c } from './util.mjs';

/**
 * Terminal prompts for the person running the harness.
 *
 * When there is no terminal (piped input, CI) or `interactive` is false, every prompt
 * returns its default, so a run never hangs waiting for someone who is not there.
 */
export class UI {
  constructor({ interactive = true } = {}) {
    this.interactive = interactive && Boolean(process.stdin.isTTY);
    this.lock = Promise.resolve();
  }

  /** Prompts are serialised: parallel agents must not interleave their questions. */
  exclusive(fn) {
    const result = this.lock.then(fn, fn);
    this.lock = result.catch(() => {});
    return result;
  }

  line(prompt) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on('SIGINT', () => {
        rl.close();
        process.kill(process.pid, 'SIGINT');
      });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async text(question, { fallback = '', hint } = {}) {
    if (!this.interactive) return fallback;
    return this.exclusive(async () => {
      console.log(`\n${c.bold(question)}`);
      if (hint) console.log(c.dim(hint));
      const answer = await this.line(c.cyan('> '));
      return answer || fallback;
    });
  }

  /** options: [{ value, label, description }]. Returns the chosen value. */
  async select(question, options, { fallback } = {}) {
    const def = fallback ?? options[0].value;
    if (!this.interactive) return def;
    return this.exclusive(async () => {
      console.log(`\n${c.bold(question)}`);
      options.forEach((o, i) => {
        const mark = o.value === def ? c.dim(' (default)') : '';
        console.log(`  ${c.cyan(String(i + 1))}. ${o.label}${mark}`);
        if (o.description) console.log(c.dim(`     ${o.description}`));
      });
      for (;;) {
        const answer = await this.line(c.cyan(`Choose 1-${options.length} [Enter = default]: `));
        if (!answer) return def;
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
        const byName = options.find((o) => o.value === answer.toLowerCase());
        if (byName) return byName.value;
        console.log(c.yellow('Enter one of the numbers shown.'));
      }
    });
  }

  /** Returns an array of chosen values. */
  async multiSelect(question, options, { fallback = [] } = {}) {
    if (!this.interactive) return fallback;
    return this.exclusive(async () => {
      console.log(`\n${c.bold(question)}`);
      options.forEach((o, i) => {
        const mark = fallback.includes(o.value) ? c.dim(' (default)') : '';
        console.log(`  ${c.cyan(String(i + 1))}. ${o.label}${mark}`);
        if (o.description) console.log(c.dim(`     ${o.description}`));
      });
      for (;;) {
        const answer = await this.line(c.cyan('Choose one or more, comma separated [Enter = default]: '));
        if (!answer) return fallback;
        const picks = answer.split(/[\s,]+/).filter(Boolean).map(Number);
        if (picks.length && picks.every((n) => Number.isInteger(n) && n >= 1 && n <= options.length)) {
          return [...new Set(picks)].map((n) => options[n - 1].value);
        }
        console.log(c.yellow('Enter numbers from the list, separated by commas.'));
      }
    });
  }

  async confirm(question, { fallback = false } = {}) {
    if (!this.interactive) return fallback;
    return this.exclusive(async () => {
      const answer = await this.line(`\n${c.bold(question)} ${c.dim(fallback ? '[Y/n]' : '[y/N]')} `);
      if (!answer) return fallback;
      return /^y(es)?$/i.test(answer);
    });
  }
}

export function banner(title) {
  const bar = '━'.repeat(Math.min(72, Math.max(12, title.length + 4)));
  console.log(`\n${c.magenta(bar)}\n${c.bold(c.magenta('  ' + title))}\n${c.magenta(bar)}`);
}

export function info(msg) {
  console.log(`${c.blue('•')} ${msg}`);
}

export function ok(msg) {
  console.log(`${c.green('✓')} ${msg}`);
}

export function warn(msg) {
  console.log(`${c.yellow('!')} ${msg}`);
}

export function fail(msg) {
  console.log(`${c.red('✗')} ${msg}`);
}
