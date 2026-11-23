/**
 * Translates the chosen access mode into concrete Claude Code and Codex permissions.
 *
 * Two independent ideas:
 *   - the ACCESS mode decides how freely agents act inside the product folder;
 *   - the go-live lock blocks deploy and publish commands until the release is approved
 *     (by the person, or by the director when the approvals mode is fully autonomous).
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
  // A decision-only step (the director reviewing, triaging, answering) must not change the product.
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
  // Never danger-full-access: Codex roles only write documents, and full access would let
  // them push or deploy, which no prefix rule can stop on the Codex side.
  void access;
  return { sandbox: write ? 'workspace-write' : 'read-only', network: true };
}

/**
 * Environment variables that let a process act on cloud accounts, registries or git hosts.
 * Agents do not get them until go-live is approved: a deny rule matches command text,
 * which `bash -c`, a script or an SDK call can route around, but a missing token cannot.
 */
const CREDENTIAL_ENV = [
  /^AWS_/,
  /^AZURE_/,
  /^ARM_(CLIENT|TENANT|SUBSCRIPTION)_/,
  /^GOOGLE_(APPLICATION_CREDENTIALS|CLOUD_KEYFILE_JSON|CREDENTIALS)$/,
  /^CLOUDSDK_/,
  /^(GITHUB|GH|GITLAB|GL|BITBUCKET)_TOKEN$/,
  /^GH_ENTERPRISE_TOKEN$/,
  /^(NPM|NODE_AUTH|YARN_NPM_AUTH)_TOKEN$/,
  /^(VERCEL|NETLIFY_AUTH|FLY_API|FLY_ACCESS|RAILWAY|RAILWAY_API|RENDER_API|CLOUDFLARE_API|CF_API|DIGITALOCEAN|DIGITALOCEAN_ACCESS|SUPABASE_ACCESS|FIREBASE|HEROKU_API|PULUMI_ACCESS|TF_TOKEN_.+|DOCKERHUB|DOCKER)_TOKEN$/,
  /^(HEROKU_API_KEY|CLOUDFLARE_API_KEY|DOCKER_AUTH_CONFIG|DOCKER_PASSWORD|KUBECONFIG|VAULT_TOKEN|SSH_AUTH_SOCK)$/,
];

/** Git config passed through the environment (GIT_CONFIG_COUNT), appended to any the caller already set. */
function withGitConfig(env, pairs) {
  const start = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10) || 0;
  pairs.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${start + i}`] = key;
    env[`GIT_CONFIG_VALUE_${start + i}`] = value;
  });
  env.GIT_CONFIG_COUNT = String(start + pairs.length);
  return env;
}

/** Every push URL is rewritten to a scheme git cannot use, however the push is invoked. */
const PUSH_LOCK = ['https://', 'http://', 'ssh://', 'git@', 'git://', 'file://'].map((prefix) => ['url.harness-golive-locked://.pushInsteadOf', prefix]);

/**
 * Signing policy for unattended commits, from HARNESS_GIT_SIGN:
 *   auto (default)  sign when the owner's git config says so; if signing cannot complete
 *                   with nobody at the keyboard, commit unsigned and say so
 *   require         sign, and stop the run if signing fails
 *   off             never sign
 */
export function signingPolicy(base = process.env) {
  const v = String(base.HARNESS_GIT_SIGN ?? 'auto').toLowerCase();
  return ['require', 'off'].includes(v) ? v : 'auto';
}

/** Environment for the harness's own git commands. */
export function harnessGitEnv(base = process.env) {
  const env = { ...base };
  return signingPolicy(base) === 'off' ? withGitConfig(env, [['commit.gpgsign', 'false'], ['tag.gpgsign', 'false']]) : env;
}

/**
 * The environment an agent process starts with. Before go-live: no credential variables
 * and no git push. After go-live (the approved deploy step): the owner's full environment.
 */
export function agentEnv({ goliveUnlocked = false, base = process.env } = {}) {
  const env = harnessGitEnv(base);
  if (goliveUnlocked) return env;
  for (const key of Object.keys(env)) {
    if (CREDENTIAL_ENV.some((re) => re.test(key))) delete env[key];
  }
  return withGitConfig(env, PUSH_LOCK);
}

export const _internal = { GOLIVE_DENY, ALWAYS_DENY, STRICT_ALLOW, CREDENTIAL_ENV };
