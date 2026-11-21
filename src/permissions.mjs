/**
 * Translates the chosen access mode into concrete Claude Code and Codex permissions.
 *
 * Two independent ideas:
 *   - the ACCESS mode decides how freely agents act inside the product folder;
 *   - the go-live lock blocks deploy and publish commands until the release is approved
 *     (by the person, or by the boss when the approvals mode is fully autonomous).
 * Deny rules apply in every Claude permission mode, including bypass.
 */

/** Commands that make something public or change live infrastructure. */
const GOLIVE_DENY = [
  'Bash(git push:*)',
  'Bash(gh pr merge:*)',
  'Bash(gh release:*)',
  'Bash(npm publish:*)',
  'Bash(pnpm publish:*)',
  'Bash(yarn publish:*)',
  'Bash(vercel:*)',
  'Bash(npx vercel:*)',
  'Bash(railway:*)',
  'Bash(npx railway:*)',
  'Bash(render:*)',
  'Bash(fly:*)',
  'Bash(flyctl:*)',
  'Bash(netlify:*)',
  'Bash(npx netlify:*)',
  'Bash(wrangler:*)',
  'Bash(npx wrangler:*)',
  'Bash(firebase deploy:*)',
  'Bash(supabase db push:*)',
  'Bash(supabase functions deploy:*)',
  'Bash(terraform apply:*)',
  'Bash(terraform destroy:*)',
  'Bash(pulumi up:*)',
  'Bash(pulumi destroy:*)',
  'Bash(kubectl apply:*)',
  'Bash(kubectl delete:*)',
  'Bash(helm install:*)',
  'Bash(helm upgrade:*)',
  'Bash(docker push:*)',
  'Bash(aws:*)',
  'Bash(gcloud:*)',
  'Bash(az:*)',
];

/** Never appropriate for an agent, whatever the mode. */
const ALWAYS_DENY = [
  'Bash(sudo:*)',
  'Read(~/.ssh/**)',
  'Read(~/.aws/**)',
  'Read(~/.gnupg/**)',
  'Read(~/.config/gcloud/**)',
  'Read(~/.azure/**)',
  'Read(~/.kube/**)',
  'Read(~/.netrc)',
  'Read(~/.npmrc)',
  'Read(~/.codex/auth.json)',
  'Read(~/.claude/.credentials.json)',
  'Edit(~/.claude/**)',
  'Edit(~/.codex/**)',
  'Edit(~/.zshrc)',
  'Edit(~/.bashrc)',
  'Edit(~/.gitconfig)',
];

/** What "strict" mode lets agents run. Everything else is refused without asking. */
const STRICT_ALLOW = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Skill',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
  ...[
    'git status', 'git diff', 'git log', 'git show', 'git add', 'git commit', 'git branch', 'git checkout', 'git switch',
    'git merge', 'git rebase', 'git stash', 'git restore', 'git rev-parse', 'git ls-files', 'git worktree', 'git mv', 'git rm',
    'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node', 'tsc', 'python', 'python3', 'pip', 'pip3', 'uv', 'pytest', 'ruff',
    'cargo', 'go', 'make', 'docker build', 'docker compose', 'docker run', 'docker ps', 'docker logs',
    'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'rg', 'sed', 'awk', 'sort', 'uniq', 'diff', 'jq', 'tree',
    'mkdir', 'touch', 'cp', 'mv', 'rm', 'echo', 'pwd', 'which', 'env', 'date', 'curl', 'lsof', 'kill', 'sleep', 'open',
  ].map((cmd) => `Bash(${cmd}:*)`),
];

const CLAUDE_MODE = { guarded: 'auto', bypass: 'bypassPermissions', strict: 'dontAsk' };

/**
 * @param {object} o
 * @param {'guarded'|'bypass'|'strict'} o.access
 * @param {boolean} o.goliveUnlocked  true only for a release step that has been approved
 * @param {boolean} o.readOnly        reviewers who must not change the product
 */
export function claudePermissions({ access, goliveUnlocked = false, readOnly = false }) {
  const deny = [...ALWAYS_DENY];
  if (!goliveUnlocked) deny.push(...GOLIVE_DENY);
  // A decision-only step (the boss reviewing, triaging, answering) must not change the product.
  if (readOnly) deny.push('Edit', 'Write', 'NotebookEdit');
  const settings = { permissions: { deny } };
  if (access === 'strict') settings.permissions.allow = [...STRICT_ALLOW];
  return { permissionMode: CLAUDE_MODE[access], settings };
}

/**
 * Codex roles research, decide and write documents; they do not build or deploy.
 * `write` lets the role create files in the product folder; network is for web research.
 */
export function codexPermissions({ access, write = false }) {
  if (access === 'bypass' && write) return { sandbox: 'danger-full-access', network: true };
  return { sandbox: write ? 'workspace-write' : 'read-only', network: true };
}

export const _internal = { GOLIVE_DENY, ALWAYS_DENY, STRICT_ALLOW };
