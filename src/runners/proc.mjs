import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const live = new Set();
const GROUPS = process.platform !== 'win32';

/**
 * Signal an agent and everything it started. Each agent runs in its own process group, so
 * the dev servers, browsers and test runners it launched stop with it instead of
 * outliving the run and holding its ports.
 */
function killTree(child, signal) {
  try {
    if (GROUPS && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

/** Stop every agent process that is still running (used when the harness itself is interrupted). */
export function killAll(signal = 'SIGTERM') {
  for (const child of live) killTree(child, signal);
}

// Agents live in their own process groups, so they no longer receive the terminal's
// Ctrl-C or die with the harness by themselves. Whatever is still running when the
// harness exits, however it exits, is stopped.
process.on('exit', () => killAll('SIGKILL'));

/**
 * Run a CLI that emits one JSON object per line on stdout.
 * Every raw line goes to `logFile`; parsed objects go to `onEvent`.
 *
 * Resolves with { code, signal, timedOut, stderr }. Never rejects for a non-zero exit:
 * the caller decides what a failure means.
 */
export function runJsonLines({ cmd, args, cwd, env, stdin, logFile, onEvent, timeoutMs }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const log = fs.createWriteStream(logFile, { flags: 'a' });
    const child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: GROUPS });
    live.add(child);

    let buffer = '';
    let stderr = '';
    let timedOut = false;
    let killTimer;

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child, 'SIGTERM');
          killTimer = setTimeout(() => killTree(child, 'SIGKILL'), 10_000);
        }, timeoutMs)
      : null;

    const handleLine = (line) => {
      if (!line.trim()) return;
      log.write(line + '\n');
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return; // not JSON (a stray warning line); it is still in the log
      }
      try {
        onEvent?.(event);
      } catch (err) {
        log.write(`[harness] event handler error: ${err.message}\n`);
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      live.delete(child);
      log.end();
      reject(new Error(`Could not start ${cmd}: ${err.message}`));
    });

    // A background process the agent left behind can hold stdout open, and 'close' waits
    // for every holder. When the agent itself exits, stop its group so the run moves on.
    child.on('exit', () => killTree(child, 'SIGTERM'));

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      live.delete(child);
      // The agent is done; anything it left running in its group goes with it.
      killTree(child, 'SIGTERM');
      if (buffer) handleLine(buffer);
      if (stderr.trim()) log.write(`[stderr] ${stderr.trim()}\n`);
      log.end();
      resolve({ code, signal, timedOut, stderr });
    });

    child.stdin.on('error', () => {}); // the CLI may exit before reading all of stdin
    child.stdin.end(stdin ?? '');
  });
}
