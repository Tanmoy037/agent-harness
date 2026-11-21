import fs from 'node:fs';
import path from 'node:path';
import { HARNESS_HOME, readJson, readText, writeJson, writeText, HarnessError } from './util.mjs';

/**
 * The team: who the roles are, which engine runs each, and which skills each one carries.
 *
 * `harness team build` turns the registry into one folder per role:
 *   build/claude/<role>/   a Claude Code plugin: the role's skills, plus system-prompt.md
 *   build/codex/<role>/    a Codex working folder: AGENTS.md (the role prompt) and .agents/skills
 * A session started with a role's folder sees that role's curated skills.
 */

export const TEAM_DIR = path.join(HARNESS_HOME, 'team');
export const SKILLS_DIR = path.join(HARNESS_HOME, 'skills');
export const BUILD_DIR = path.join(HARNESS_HOME, 'build');

/** Later sources win, so the team's own skills override a vendored skill of the same name. */
const SKILL_ROOTS = ['vendor', 'learned', 'custom'];

const AGENTS_MD_LIMIT = 32 * 1024; // Codex reads at most this much of AGENTS.md

export function loadTeam() {
  const registry = readJson(path.join(TEAM_DIR, 'roles.json'));
  const learned = readJson(path.join(TEAM_DIR, 'learned.json'), {});
  const roles = {};
  for (const [id, role] of Object.entries(registry.roles)) {
    roles[id] = { id, ...role, skills: [...new Set([...(role.skills ?? []), ...(learned[id] ?? [])])] };
  }
  return { engines: registry.engines, roles };
}

export function getRole(team, id) {
  const role = team.roles[id];
  if (!role) throw new HarnessError(`Unknown role "${id}". Roles: ${Object.keys(team.roles).join(', ')}`);
  return role;
}

/** Which engine actually runs a role, given who the owner chose as boss. */
export function resolveEngine(team, role, modes) {
  if (role.engine === 'claude') return { kind: 'claude', ...team.engines.claude };
  // The boss and the business specialists follow the chosen boss engine.
  return modes.bossEngine === 'claude' ? { kind: 'claude', ...team.engines.claudeBoss } : { kind: 'codex', ...team.engines.codex };
}

export function findSkill(name) {
  let found = null;
  for (const root of SKILL_ROOTS) {
    const dir = path.join(SKILLS_DIR, root, name);
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) found = dir;
  }
  return found;
}

export function allSkills() {
  const out = new Map();
  for (const root of SKILL_ROOTS) {
    const dir = path.join(SKILLS_DIR, root);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, name, 'SKILL.md'))) out.set(name, { name, root, dir: path.join(dir, name) });
    }
  }
  return [...out.values()];
}

export function skillDescription(dir) {
  const text = readText(path.join(dir, 'SKILL.md'), '');
  const front = text.match(/^---\n([\s\S]*?)\n---/);
  if (!front) return '';
  const lines = front[1].split('\n');
  const start = lines.findIndex((l) => /^description:/.test(l));
  if (start === -1) return '';
  let value = lines[start].replace(/^description:\s*/, '');
  // Folded or literal block scalars continue on the following indented lines.
  if (/^[>|][+-]?$/.test(value.trim()) || value.trim() === '') {
    const rest = [];
    for (const l of lines.slice(start + 1)) {
      if (/^\s+\S/.test(l)) rest.push(l.trim());
      else break;
    }
    value = rest.join(' ');
  }
  return value.replace(/^["']|["']$/g, '').trim();
}

export function rolePrompt(roleId) {
  const own = readText(path.join(TEAM_DIR, 'prompts', `${roleId}.md`), null);
  if (own === null) throw new HarnessError(`Missing role prompt: team/prompts/${roleId}.md`);
  const handbook = readText(path.join(TEAM_DIR, 'handbook.md'));
  return `${own.trim()}\n\n${handbook.trim()}\n`;
}

function linkSkills(targetDir, skills, problems, roleId) {
  fs.mkdirSync(targetDir, { recursive: true });
  const linked = [];
  for (const name of skills) {
    const source = findSkill(name);
    if (!source) {
      problems.push(`${roleId}: skill "${name}" is not installed (run: harness skills install)`);
      continue;
    }
    fs.symlinkSync(source, path.join(targetDir, name), 'dir');
    linked.push(name);
  }
  return linked;
}

/** Rebuild every role folder from the registry. Returns { roles: {id: {skills}}, problems: [] }. */
export function buildTeam() {
  const team = loadTeam();
  const problems = [];
  const summary = {};
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });

  for (const role of Object.values(team.roles)) {
    const prompt = rolePrompt(role.id);

    // Every role gets a Claude folder: Claude roles always, boss-side roles when Claude Fable is the boss.
    const claudeDir = path.join(BUILD_DIR, 'claude', role.id);
    writeJson(path.join(claudeDir, '.claude-plugin', 'plugin.json'), {
      name: 'team',
      version: '1.0.0',
      description: `Skills for the ${role.title}`,
    });
    writeText(path.join(claudeDir, 'system-prompt.md'), prompt);
    const linked = linkSkills(path.join(claudeDir, 'skills'), role.skills, problems, role.id);

    if (role.engine !== 'claude') {
      const codexDir = path.join(BUILD_DIR, 'codex', role.id);
      writeText(path.join(codexDir, 'AGENTS.md'), prompt);
      if (Buffer.byteLength(prompt) > AGENTS_MD_LIMIT) {
        problems.push(`${role.id}: role prompt is ${Buffer.byteLength(prompt)} bytes; Codex reads only the first ${AGENTS_MD_LIMIT}`);
      }
      linkSkills(path.join(codexDir, '.agents', 'skills'), role.skills, [], role.id);
    }
    summary[role.id] = { title: role.title, engine: role.engine, skills: linked };
  }
  writeJson(path.join(BUILD_DIR, 'team.json'), { built: new Date().toISOString(), roles: summary });
  return { roles: summary, problems };
}

export const claudeRoleDir = (roleId) => path.join(BUILD_DIR, 'claude', roleId);
export const codexRoleDir = (roleId) => path.join(BUILD_DIR, 'codex', roleId);

/** Attach a skill the team wrote for itself to a role. Takes effect at the next build. */
export function attachLearnedSkill(roleId, skillName) {
  const file = path.join(TEAM_DIR, 'learned.json');
  const learned = readJson(file, {});
  learned[roleId] = [...new Set([...(learned[roleId] ?? []), skillName])];
  writeJson(file, learned);
}
