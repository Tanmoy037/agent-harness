import fs from 'node:fs';
import path from 'node:path';
import { runJsonLines } from './proc.mjs';
import { truncate } from '../util.mjs';

function describeItem(item) {
  switch (item.type) {
    case 'command_execution':
      return `$ ${truncate(String(item.command ?? '').replace(/^\/bin\/(zsh|bash) -lc /, ''), 90)}`;
    case 'web_search':
      return `search: ${truncate(item.query, 80)}`;
    case 'file_change':
      return `edit ${truncate((item.changes ?? []).map((ch) => path.basename(ch.path)).join(', '), 80)}`;
    case 'mcp_tool_call':
      return `tool: ${item.server}/${item.tool}`;
    default:
      return null;
  }
}

/** The model returns JSON as text; tolerate a fenced block around it. */
function parseJsonMessage(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

/**
 * Run one headless Codex session as a team role.
 *
 * `roleDir` is the role's own folder: its AGENTS.md is the role prompt and its
 * `.agents/skills` are the role's curated skills. The product folder is reached by
 * absolute path, and made writable with --add-dir when the role may write documents.
 *
 * Returns { ok, text, structured, sessionId, usage, error }.
 */
export async function runCodex({
  prompt,
  roleDir,
  projectDir,
  model,
  effort = 'high',
  sandbox = 'read-only',
  network = true,
  webSearch = true,
  schemaFile,
  resume,
  extraWritableDirs = [],
  env = {},
  baseEnv = process.env,
  logFile,
  onActivity,
  timeoutMs,
  bin = 'codex',
}) {
  const args = ['exec', '--skip-git-repo-check', '-C', roleDir, '-s', sandbox];
  if (sandbox !== 'read-only') {
    for (const dir of [projectDir, ...extraWritableDirs].filter(Boolean)) args.push('--add-dir', dir);
  }
  if (model) args.push('-m', model);
  args.push('-c', `model_reasoning_effort="${effort}"`);
  if (webSearch) args.push('-c', 'web_search="live"');
  if (sandbox === 'workspace-write' && network) args.push('-c', 'sandbox_workspace_write.network_access=true');
  // Only the role's own curated skills should steer it, not the generic bundled ones.
  args.push('-c', 'skills.bundled.enabled=false');
  // Sandbox and directory flags must come before `resume`; output flags are accepted after it.
  if (resume) args.push('resume', resume);
  if (schemaFile) args.push('--output-schema', schemaFile);
  args.push('--json', '-');

  let sessionId = null;
  let lastMessage = '';
  let usage = null;
  let failure = null;

  const proc = await runJsonLines({
    cmd: bin,
    args,
    cwd: roleDir,
    env: { ...baseEnv, ...env },
    stdin: prompt,
    logFile,
    timeoutMs,
    onEvent: (event) => {
      if (event.type === 'thread.started') sessionId = event.thread_id;
      else if (event.type === 'turn.completed') usage = event.usage ?? null;
      else if (event.type === 'turn.failed') failure = event.error?.message ?? 'turn failed';
      else if (event.type === 'error') failure = event.message ?? 'error';
      else if (event.type === 'item.completed' && event.item) {
        if (event.item.type === 'agent_message') lastMessage = event.item.text ?? '';
        else if (event.item.type === 'error') failure = event.item.message ?? failure;
      } else if (event.type === 'item.started' && event.item) {
        const line = describeItem(event.item);
        if (line) onActivity?.(line);
      }
    },
  });

  if (proc.timedOut) {
    return { ok: false, sessionId, text: lastMessage, error: `Timed out after ${Math.round(timeoutMs / 60000)} minutes` };
  }
  if (proc.code !== 0 || (failure && !lastMessage)) {
    return {
      ok: false,
      sessionId,
      text: lastMessage,
      error: truncate(failure ?? `codex exited with code ${proc.code}. ${proc.stderr}`, 500),
    };
  }
  // Codex starts a new thread when a resume id does not resolve; that would silently drop context.
  if (resume && sessionId && sessionId !== resume) {
    return { ok: false, sessionId, text: lastMessage, error: `Could not resume Codex session ${resume}; a new session was started instead.` };
  }

  const out = { ok: true, text: lastMessage, structured: null, sessionId, usage };
  if (schemaFile) {
    try {
      out.structured = parseJsonMessage(lastMessage);
    } catch (err) {
      return { ...out, ok: false, error: `Codex did not return valid JSON for the requested schema: ${err.message}` };
    }
  }
  return out;
}

/** Codex needs the schema as a file; write it once per run. */
export function writeSchemaFile(dir, name, schema) {
  const file = path.join(dir, `${name}.schema.json`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(schema, null, 2));
  }
  return file;
}
