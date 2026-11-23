import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { harnessGitEnv, signingPolicy } from './permissions.mjs';

const GIT_ENV = harnessGitEnv();
const SIGNING_FAILURE = /gpg failed|failed to sign|couldn't sign|signing .* failed|agent refused|error: (gpg|ssh-keygen)|no secret key|incorrect passphrase|ssh-keygen.*-Y sign/i;
let warnedUnsigned = false;

/**
 * Run a committing git command (commit, merge) honouring the owner's signing config.
 * Signing can need a human (a hardware key, a 1Password or Secretive prompt). When it
 * fails and HARNESS_GIT_SIGN is not "require", the same command is retried unsigned so
 * the run does not stop, and the owner is told once.
 */
async function signedOrUnsigned(cwd, args) {
  const r = await git(cwd, args);
  if (r.ok || signingPolicy() === 'require' || !SIGNING_FAILURE.test(`${r.stderr}\n${r.stdout}`)) return r;
  // A merge that fails at the signing step leaves the merge staged with MERGE_HEAD set:
  // conclude it unsigned rather than starting it again.
  const merging = args.includes('merge') && (await git(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
  const identity = args.slice(0, args.findIndex((a) => a === 'commit' || a === 'merge'));
  const retry = merging
    ? await git(cwd, [...identity, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-edit', '--no-verify'])
    : await git(cwd, ['-c', 'commit.gpgsign=false', ...args]);
  if (retry.ok && !warnedUnsigned) {
    warnedUnsigned = true;
    console.warn('! Your git config signs commits, but signing needs someone at the keyboard. The team\'s commits on the run branch are unsigned; sign them when you merge, or set HARNESS_GIT_SIGN=require to stop instead.');
  }
  return retry.ok ? retry : r;
}

/** Run git and resolve with { ok, stdout, stderr }. Never throws for a non-zero exit. */
export function git(cwd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer, env: GIT_ENV }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout ?? '').trimEnd(), stderr: String(stderr ?? '').trim() });
    });
  });
}

async function must(cwd, args) {
  const r = await git(cwd, args);
  if (!r.ok) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr || r.stdout}`);
  return r.stdout;
}

// Agents commit under the owner's git identity when one is configured, otherwise a neutral one.
async function identityArgs(cwd) {
  const name = await git(cwd, ['config', 'user.name']);
  const email = await git(cwd, ['config', 'user.email']);
  return name.stdout && email.stdout ? [] : ['-c', 'user.name=Harness', '-c', 'user.email=harness@localhost'];
}

export async function isRepo(dir) {
  return (await git(dir, ['rev-parse', '--is-inside-work-tree'])).stdout === 'true';
}

export async function repoRoot(dir) {
  return must(dir, ['rev-parse', '--show-toplevel']);
}

export async function hasCommits(dir) {
  return (await git(dir, ['rev-parse', '--verify', 'HEAD'])).ok;
}

export async function head(dir) {
  return (await git(dir, ['rev-parse', 'HEAD'])).stdout;
}

export async function currentBranch(dir) {
  return (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;
}

export async function isClean(dir) {
  return (await git(dir, ['status', '--porcelain'])).stdout === '';
}

export async function trackedFileCount(dir) {
  const r = await git(dir, ['ls-files']);
  return r.ok && r.stdout ? r.stdout.split('\n').length : 0;
}

/**
 * Keep the harness's own working files out of the product's history without touching the
 * product's .gitignore: .git/info/exclude is local to this clone and shared by its worktrees.
 */
export async function excludeLocally(dir, entries) {
  const common = await must(dir, ['rev-parse', '--git-common-dir']);
  const file = path.join(path.resolve(dir, common), 'info', 'exclude');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = new Set(current.split('\n').map((l) => l.trim()));
  const missing = entries.filter((e) => !lines.has(e));
  if (!missing.length) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}# agent harness working files\n${missing.join('\n')}\n`);
  return true;
}

export async function initRepo(dir) {
  await must(dir, ['init', '-q', '-b', 'main']);
}

/** Commit everything that changed. Returns the new commit sha, or null when nothing changed. */
export async function commitAll(dir, message) {
  await must(dir, ['add', '-A']);
  const staged = await git(dir, ['diff', '--cached', '--quiet']);
  if (staged.ok) return null; // exit 0 means no staged changes
  const id = await identityArgs(dir);
  const r = await signedOrUnsigned(dir, [...id, 'commit', '-q', '--no-verify', '-m', message]);
  if (!r.ok) throw new Error(`git commit failed in ${dir}: ${r.stderr || r.stdout}`);
  return head(dir);
}

export async function createBranch(dir, name) {
  await must(dir, ['checkout', '-q', '-b', name]);
}

export async function branchExists(dir, name) {
  return (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])).ok;
}

export async function addWorktree(repoDir, worktreeDir, branch, base) {
  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
  if (fs.existsSync(worktreeDir)) return; // resumed run: the worktree is already there
  if (await branchExists(repoDir, branch)) await must(repoDir, ['worktree', 'add', '-q', worktreeDir, branch]);
  else await must(repoDir, ['worktree', 'add', '-q', '-b', branch, worktreeDir, base]);
}

/** Remove a task's worktree and, once it is merged, its branch. */
export async function removeWorktree(repoDir, worktreeDir, mergedBranch) {
  await git(repoDir, ['worktree', 'remove', '--force', worktreeDir]);
  await git(repoDir, ['worktree', 'prune']);
  // -d (not -D) refuses to delete a branch that is not fully merged, so unmerged work is never lost.
  if (mergedBranch) await git(repoDir, ['branch', '-d', mergedBranch]);
}

/**
 * Merge a task branch into the checked-out integration branch.
 * Returns { ok: true } or { ok: false, conflicts: [files] } with the merge left in progress
 * so an engineer can resolve it.
 */
export async function mergeBranch(dir, branch, message) {
  const id = await identityArgs(dir);
  const r = await signedOrUnsigned(dir, [...id, 'merge', '--no-ff', '--no-verify', '-m', message, branch]);
  if (r.ok) return { ok: true };
  const conflicts = (await git(dir, ['diff', '--name-only', '--diff-filter=U'])).stdout.split('\n').filter(Boolean);
  if (!conflicts.length) throw new Error(`git merge ${branch} failed: ${r.stderr || r.stdout}`);
  return { ok: false, conflicts };
}

export async function mergeInProgress(dir) {
  return (await git(dir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
}

export async function abortMerge(dir) {
  await git(dir, ['merge', '--abort']);
}

export async function diffStat(dir, from, to = 'HEAD') {
  return (await git(dir, ['diff', '--stat', `${from}...${to}`])).stdout;
}

export async function changedFilesSince(dir, from) {
  const r = await git(dir, ['diff', '--name-only', `${from}..HEAD`]);
  return r.ok && r.stdout ? r.stdout.split('\n') : [];
}

export async function commitExists(dir, sha) {
  return (await git(dir, ['cat-file', '-e', `${sha}^{commit}`])).ok;
}
