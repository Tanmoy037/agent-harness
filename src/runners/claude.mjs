import { runJsonLines } from './proc.mjs';
import { truncate } from '../util.mjs';

/** A one-line description of what the agent is doing right now, for the progress display. */
function describeToolUse(block) {
  const i = block.input ?? {};
  switch (block.name) {
    case 'Bash':
      return `$ ${truncate(i.command, 90)}`;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `${block.name} ${truncate(i.file_path ?? i.notebook_path, 80)}`;
    case 'Glob':
    case 'Grep':
      return `${block.name} ${truncate(i.pattern, 60)}`;
    case 'WebSearch':
      return `search: ${truncate(i.query, 80)}`;
    case 'WebFetch':
      return `fetch ${truncate(i.url, 80)}`;
    case 'Skill':
      return `skill: ${i.skill ?? ''}`;
    case 'Agent':
    case 'Task':
      return `subagent: ${truncate(i.description ?? i.prompt, 70)}`;
    default:
      return block.name;
  }
}

/**
 * Run one headless Claude Code session as a team role.
 *
 * The role prompt is appended to Claude Code's own system prompt, and the role's curated
 * skills arrive through its plugin folder, so each role sees its own skill set.
 *
 * Returns { ok, text, structured, sessionId, costUsd, turns, denials, error }.
 */
export async function runClaude({
  prompt,
  cwd,
  model = 'opus',
  effort = 'high',
  pluginDir,
  systemPromptFile,
  permissionMode,
  settingsFile,
  schema,
  resume,
  addDirs = [],
  mcpConfig,
  env = {},
  baseEnv = process.env,
  logFile,
  onActivity,
  timeoutMs,
  bin = 'claude',
}) {
  const args = ['-p', '--model', model, '--effort', effort, '--output-format', 'stream-json', '--verbose'];
  if (pluginDir) args.push('--plugin-dir', pluginDir);
  if (systemPromptFile) args.push('--append-system-prompt-file', systemPromptFile);
  if (permissionMode) args.push('--permission-mode', permissionMode);
  // Nobody is at the keyboard for these sessions: anything that would prompt is refused.
  args.push('--permission-prompts', 'none');
  if (settingsFile) args.push('--settings', settingsFile);
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  if (resume) args.push('--resume', resume);
  for (const dir of addDirs) args.push('--add-dir', dir);
  if (mcpConfig) args.push('--mcp-config', mcpConfig);

  let result = null;
  let sessionId = resume ?? null;
  let lastText = '';

  const proc = await runJsonLines({
    cmd: bin,
    args,
    cwd,
    env: { ...baseEnv, ...env },
    stdin: prompt,
    logFile,
    timeoutMs,
    onEvent: (event) => {
      if (event.session_id) sessionId = event.session_id;
      if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'tool_use') onActivity?.(describeToolUse(block));
          else if (block.type === 'text' && block.text?.trim()) lastText = block.text;
        }
      } else if (event.type === 'result') {
        result = event;
      }
    },
  });

  if (proc.timedOut) {
    return { ok: false, sessionId, error: `Timed out after ${Math.round(timeoutMs / 60000)} minutes`, text: lastText };
  }
  if (!result) {
    return {
      ok: false,
      sessionId,
      text: lastText,
      error: `claude exited (code ${proc.code}) without a result. ${truncate(proc.stderr, 400)}`,
    };
  }

  const out = {
    ok: !result.is_error,
    text: result.result ?? lastText,
    structured: result.structured_output ?? null,
    sessionId,
    costUsd: result.total_cost_usd ?? 0,
    turns: result.num_turns ?? 0,
    denials: (result.permission_denials ?? []).map((d) => `${d.tool_name}: ${truncate(JSON.stringify(d.tool_input), 120)}`),
  };
  if (result.is_error) out.error = truncate(result.result ?? result.subtype ?? 'unknown error', 500);
  return out;
}
