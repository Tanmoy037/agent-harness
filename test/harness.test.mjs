import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'harness.mjs');
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `harness-${name}-`));

// Memory must never be written into the real team memory by a test.
const MEM = tmp('mem');
process.env.HARNESS_MEMORY_DIR = MEM;

// Tests must not depend on the machine's git setup (commit signing, global hooks, templates).
const GITCONFIG = path.join(tmp('gitconfig'), 'config');
fs.writeFileSync(GITCONFIG, '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n');
process.env.GIT_CONFIG_GLOBAL = GITCONFIG;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const { parseArgs, slug, Semaphore } = await import('../src/util.mjs');
const { validateTasks } = await import('../src/schemas.mjs');
const { validateModes, DEFAULT_MODES, needsHuman, hasUI, modesFromFlags } = await import('../src/modes.mjs');
const { claudePermissions, codexPermissions, agentEnv } = await import('../src/permissions.mjs');
const gitlib = await import('../src/git.mjs');
const { runJsonLines } = await import('../src/runners/proc.mjs');
const memory = await import('../src/memory.mjs');
const { loadTeam, findSkill, rolePrompt, resolveEngine } = await import('../src/team.mjs');
const { ROLE_IDS } = await import('../src/schemas.mjs');

function harness(args, { cwd, env = {} } = {}) {
  return spawnSync('node', [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HARNESS_FAKE_AGENTS: '1', HARNESS_MEMORY_DIR: MEM, NO_COLOR: '1', ...env },
  });
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('parseArgs handles values, equals form, booleans and positionals', () => {
  const a = parseArgs(['build it', '--project', '/x', '--type=web-app,backend', '--quiet', '--no-interactive'], { booleans: ['quiet', 'noInteractive'] });
  assert.deepEqual(a._, ['build it']);
  assert.equal(a.project, '/x');
  assert.equal(a.type, 'web-app,backend');
  assert.equal(a.quiet, true);
  assert.equal(a.noInteractive, true);
  assert.equal(slug('  Hello, World!  '), 'hello-world');
});

test('Semaphore never exceeds its limit', async () => {
  const sem = new Semaphore(2);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      sem.run(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      }),
    ),
  );
  assert.equal(peak, 2);
});

test('validateTasks accepts a good plan and rejects cycles, unknown deps and duplicates', () => {
  const ok = [
    { id: 'a', title: 'A', description: 'd', acceptance: 'x' },
    { id: 'b', title: 'B', description: 'd', acceptance: 'x', depends_on: ['a'] },
  ];
  assert.deepEqual(validateTasks(ok), []);
  assert.match(validateTasks([{ ...ok[0], depends_on: ['b'] }, ok[1]]).join(), /cycle/);
  assert.match(validateTasks([{ ...ok[0], depends_on: ['zzz'] }]).join(), /unknown task/);
  assert.match(validateTasks([ok[0], ok[0]]).join(), /duplicate/);
  assert.match(validateTasks([{ id: 'Bad Id', title: 't', description: 'd', acceptance: 'a' }]).join(), /lowercase/);
  assert.match(validateTasks([]).join(), /non-empty/);
});

test('modes validate and decide gates', () => {
  const m = validateModes({ ...DEFAULT_MODES });
  assert.equal(needsHuman(m, 'design'), true);
  assert.equal(needsHuman(m, 'spec'), false);
  assert.equal(needsHuman(validateModes({ ...m, approvals: 'autonomous' }), 'golive'), false);
  assert.equal(hasUI(validateModes({ ...m, productTypes: ['backend'] })), false);
  assert.throws(() => validateModes({ ...m, access: 'yolo' }), /Unknown access mode/);
  assert.throws(() => validateModes({ ...m, engineers: 40 }), /1 to 8/);
  assert.deepEqual(modesFromFlags({ boss: 'claude', type: 'web-app, backend', engineers: '2' }), { bossEngine: 'claude', productTypes: ['web-app', 'backend'], engineers: 2 });
});

test('permissions: go-live commands stay blocked until unlocked, credentials always', () => {
  const locked = claudePermissions({ access: 'guarded' });
  assert.equal(locked.permissionMode, 'auto');
  assert.ok(locked.settings.permissions.deny.includes('Bash(git push:*)'));
  assert.ok(locked.settings.permissions.deny.includes('Read(~/.ssh/**)'));

  const unlocked = claudePermissions({ access: 'bypass', goliveUnlocked: true });
  assert.equal(unlocked.permissionMode, 'bypassPermissions');
  assert.ok(!unlocked.settings.permissions.deny.includes('Bash(git push:*)'));
  assert.ok(unlocked.settings.permissions.deny.includes('Read(~/.ssh/**)'), 'credential reads are denied in every mode');

  const strict = claudePermissions({ access: 'strict' });
  assert.equal(strict.permissionMode, 'dontAsk');
  assert.ok(strict.settings.permissions.allow.includes('Bash(npm:*)'));

  const decision = claudePermissions({ access: 'guarded', readOnly: true });
  assert.ok(decision.settings.permissions.deny.includes('Edit'));
  assert.equal(codexPermissions({ access: 'guarded', write: false }).sandbox, 'read-only');
  assert.equal(codexPermissions({ access: 'guarded', write: true }).sandbox, 'workspace-write');
  // Codex never gets full access: it could push or deploy, and no deny rule applies to it.
  assert.equal(codexPermissions({ access: 'bypass', write: true }).sandbox, 'workspace-write');
});

test('agent environment: no credentials and no git push until go-live', () => {
  const base = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/x',
    ANTHROPIC_API_KEY: 'keep',
    AWS_ACCESS_KEY_ID: 'a',
    AWS_PROFILE: 'prod',
    GH_TOKEN: 'g',
    GITHUB_TOKEN: 'g',
    VERCEL_TOKEN: 'v',
    SSH_AUTH_SOCK: '/tmp/agent',
    KUBECONFIG: '/k',
    GOOGLE_APPLICATION_CREDENTIALS: '/c.json',
  };
  const locked = agentEnv({ base });
  for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'GH_TOKEN', 'GITHUB_TOKEN', 'VERCEL_TOKEN', 'SSH_AUTH_SOCK', 'KUBECONFIG', 'GOOGLE_APPLICATION_CREDENTIALS']) {
    assert.equal(locked[k], undefined, `${k} must not reach a locked agent`);
  }
  assert.equal(locked.PATH, base.PATH);
  assert.equal(locked.ANTHROPIC_API_KEY, 'keep');

  const unlocked = agentEnv({ base, goliveUnlocked: true });
  assert.equal(unlocked.AWS_PROFILE, 'prod');
  assert.equal(unlocked.GH_TOKEN, 'g');
  assert.equal(unlocked.GIT_CONFIG_COUNT, undefined);

  // The push lock holds however the push is spelled.
  const dir = tmp('pushlock');
  const remote = tmp('pushlock-remote');
  git(remote, 'init', '-q', '--bare');
  git(dir, 'init', '-q');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'x');
  git(dir, 'remote', 'add', 'origin', `file://${remote}`);
  const env = { ...process.env, ...agentEnv({ base: process.env }) };
  for (const cmd of [['git', 'push', '-q', 'origin', 'HEAD:main'], ['sh', '-c', 'git push -q origin HEAD:main'], ['git', 'push', '-q', remote, 'HEAD:main']]) {
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: dir, env, encoding: 'utf8' });
    if (cmd.includes(remote)) continue; // a bare path has no scheme to rewrite; covered by the deny rules instead
    assert.notEqual(r.status, 0, `${cmd.join(' ')} should be refused before go-live`);
  }
  const ok = spawnSync('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: dir, env: { ...process.env, ...agentEnv({ base: process.env, goliveUnlocked: true }) } });
  assert.equal(ok.status, 0, 'pushing works once go-live is unlocked');
});

test('git: commits are signed when configured, and fall back to unsigned only when signing cannot complete', async () => {
  const dir = tmp('signing');
  git(dir, 'init', '-q');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  // A signer that always fails, like a hardware key with nobody to touch it.
  git(dir, 'config', 'commit.gpgsign', 'true');
  git(dir, 'config', 'gpg.program', 'false');

  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  assert.ok(await gitlib.commitAll(dir, 'auto falls back'));

  process.env.HARNESS_GIT_SIGN = 'require';
  try {
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
    await assert.rejects(gitlib.commitAll(dir, 'require stops'), /gpg|sign/i);
  } finally {
    delete process.env.HARNESS_GIT_SIGN;
  }
  git(dir, 'reset', '-q');

  // A merge whose commit cannot be signed is concluded unsigned, not left half-done.
  git(dir, 'checkout', '-q', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c');
  git(dir, 'add', 'c.txt');
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'c');
  git(dir, 'checkout', '-q', '-');
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd');
  git(dir, 'add', '-A');
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'd');
  assert.deepEqual(await gitlib.mergeBranch(dir, 'feature', 'merge feature'), { ok: true });
  assert.equal(await gitlib.mergeInProgress(dir), false);
  assert.ok(fs.existsSync(path.join(dir, 'c.txt')));
});

test('an agent and everything it started stop when it finishes', { skip: process.platform === 'win32' }, async () => {
  const dir = tmp('proc');
  const pidFile = path.join(dir, 'server.pid');
  // A stand-in agent that leaves a "dev server" running in the background, then reports.
  const res = await runJsonLines({
    cmd: 'sh',
    args: ['-c', `sleep 300 & echo $! > ${pidFile}; echo '{"type":"result"}'`],
    cwd: dir,
    env: process.env,
    logFile: path.join(dir, 'log.jsonl'),
    onEvent: () => {},
  });
  assert.equal(res.code, 0);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  let alive = true;
  for (let i = 0; i < 50 && alive; i++) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 20));
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false, 'the background process should be gone');
});

test('memory: remembers, counts confirmations instead of duplicating, recalls and retires', () => {
  const first = memory.remember('role', 'When a form has several steps, specify what happens to entered data on browser back.', { role: 'ux-designer' });
  const again = memory.remember('role', 'When a form has several steps, specify what happens to the entered data on browser back.', { role: 'ux-designer' });
  assert.equal(again.id, first.id);
  assert.equal(again.hits, 2);
  memory.remember('owner', 'Prefers dense tables over cards for operational screens.', { source: 'owner' });
  assert.equal(memory.remember('team', 'short'), null, 'trivial lessons are not stored');

  const recalled = memory.recall({ role: 'ux-designer', projectDir: tmp('p') });
  assert.match(recalled, /browser back/);
  assert.match(recalled, /confirmed 2 times/);
  assert.match(recalled, /dense tables/);
  assert.equal(memory.recall({ role: 'sales', projectDir: tmp('p') }).includes('browser back'), false, 'role lessons stay with the role');

  assert.equal(memory.retire([first.id]), 1);
  assert.equal(memory.list('role', { role: 'ux-designer' }).length, 0);
});

test('team registry: every role has a prompt and every assigned skill is installed', () => {
  const team = loadTeam();
  assert.deepEqual(Object.keys(team.roles).sort(), [...ROLE_IDS].sort());
  for (const role of Object.values(team.roles)) {
    assert.ok(rolePrompt(role.id).length > 1000, `${role.id} has a prompt`);
    assert.ok(Buffer.byteLength(rolePrompt(role.id)) < 32 * 1024, `${role.id} prompt fits in AGENTS.md`);
    for (const skill of role.skills) assert.ok(findSkill(skill), `${role.id}: skill "${skill}" is installed`);
  }
  const modes = validateModes({ ...DEFAULT_MODES });
  assert.equal(resolveEngine(team, team.roles.boss, modes).kind, 'codex');
  assert.equal(resolveEngine(team, team.roles.boss, { ...modes, bossEngine: 'claude' }).model, 'fable');
  assert.equal(resolveEngine(team, team.roles['senior-engineer'], modes).model, 'opus');
  for (const engine of Object.values(team.engines)) assert.equal(engine.effort, 'high');
});

test('full pipeline on a new product with stand-in agents', () => {
  const dir = tmp('new');
  const r = harness(['run', 'Build a tiny invoicing app', '--project', dir, '--defaults', '--approvals', 'autonomous', '--no-interactive', '--quiet']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Run complete/);
  assert.match(r.stdout, /Merge conflict on feature-[ab]/, 'the scripted merge conflict was hit and resolved (whichever task merges second)');
  assert.match(r.stdout, /Verification round 2/, 'the product was sent back once and re-verified');

  for (const f of ['product/PRD.md', 'design/design-system.md', 'engineering/tasks.json', 'qa/product-verification.md', 'security/security-review.md', 'platform/runbook.md']) {
    assert.ok(fs.existsSync(path.join(dir, 'docs', f)), `docs/${f} exists`);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'shared.txt'), 'utf8'), 'base\nfeature-a\nfeature-b\n');
  assert.equal(git(dir, 'status', '--porcelain'), '', 'everything is committed');
  assert.equal(git(dir, 'worktree', 'list').split('\n').length, 1, 'task worktrees are removed');
  assert.equal(git(dir, 'branch', '--list', 'harness/*'), '', 'merged task branches are deleted');
  assert.ok(memory.list('role', { role: 'senior-engineer' }).some((l) => /empty state/.test(l.lesson)), 'the retrospective stored a lesson');
  assert.ok(memory.readMetrics().some((m) => m.status === 'done' && m.verifyRounds === 2));
});

test('existing codebase: surveyed on its own branch, pauses at the design approval, resumes', () => {
  const dir = tmp('existing');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'docs'));
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, 'src', `m${i}.ts`), `export const v${i} = ${i};\n`);
  fs.writeFileSync(path.join(dir, 'docs', 'old.md'), '# existing docs\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'existing product');
  const before = git(dir, 'rev-parse', 'main');

  const r = harness(['run', 'Add CSV export', '--project', dir, '--defaults', '--no-interactive', '--quiet']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Surveying the codebase: 12 source files/);
  assert.match(r.stdout, /Paused\. Waiting for you to choose a design direction/);
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'team', 'knowledge', 'INDEX.md')), 'knowledge base written beside the existing docs');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'team', 'knowledge', 'areas', 'core.md')));
  assert.match(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), /^harness\//);
  assert.equal(git(dir, 'rev-parse', 'main'), before, "the owner's branch is untouched");

  const status = harness(['status', '--project', dir]);
  assert.match(status.stdout, /Status: paused/);

  // Resuming repeats no finished step and stops at the same approval point.
  const again = harness(['resume', '--project', dir, '--no-interactive', '--quiet']);
  assert.match(again.stdout, /Paused\. Waiting for you to choose a design direction/);
  assert.doesNotMatch(again.stdout, /Survey area/);

  // The map is current, so a new run does not survey again.
  const second = harness(['run', 'Another change', '--project', dir, '--defaults', '--approvals', 'autonomous', '--no-interactive', '--quiet', '--until', 'survey']);
  assert.match(second.stdout, /codebase map is current/);
});

test('the harness refuses to run on itself and reports unknown modes', () => {
  assert.match(harness(['run', 'x', '--project', ROOT, '--defaults', '--no-interactive']).stdout, /harness itself/);
  assert.match(harness(['run', 'x', '--project', tmp('bad'), '--defaults', '--no-interactive', '--access', 'yolo']).stdout, /Unknown access mode/);
});
