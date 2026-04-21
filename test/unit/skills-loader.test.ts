/**
 * Skills Loader Tests.
 *
 * Exercises frontmatter parsing and project-over-global dedup. Uses a
 * temp project dir and a temp FORGE_HOME-like path for the global skills
 * directory by pointing `paths.skills` at the temp via env.
 *
 * The loader reads `paths.skills` which is frozen at import time. Tests
 * drop skills under the project's `.forge/skills` directory — that path
 * is used directly and doesn't require env tweaking.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSkills, loadAgents } from '../../src/skills/loader';

describe('skills/agents loader', () => {
  let projectRoot: string;
  let skillsDir: string;
  let agentsDir: string;

  beforeEach(() => {
    projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forge-skills-')));
    skillsDir = path.join(projectRoot, '.forge', 'skills');
    agentsDir = path.join(projectRoot, '.forge', 'agents');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
  });

  it('parses skill frontmatter', () => {
    fs.writeFileSync(
      path.join(skillsDir, 'my-skill.md'),
      `---\nname: my-skill\ndescription: Does a thing\ntools: [read_file, grep]\ntags: [test]\n---\n\nBody here.`,
    );
    const skills = loadSkills(projectRoot);
    const mine = skills.find((s) => s.name === 'my-skill');
    expect(mine).toBeDefined();
    expect(mine?.description).toBe('Does a thing');
    expect(mine?.tools).toEqual(['read_file', 'grep']);
    expect(mine?.tags).toEqual(['test']);
    expect(mine?.body).toContain('Body here');
  });

  it('falls back to filename when frontmatter omits name', () => {
    fs.writeFileSync(path.join(skillsDir, 'no-name.md'), `Just a plain body without frontmatter.`);
    const skills = loadSkills(projectRoot);
    const found = skills.find((s) => s.name === 'no-name');
    expect(found).toBeDefined();
  });

  it('tolerates corrupt frontmatter without crashing', () => {
    fs.writeFileSync(path.join(skillsDir, 'broken.md'), `---\n: not valid yaml : : \n---\nbody`);
    expect(() => loadSkills(projectRoot)).not.toThrow();
  });

  it('loads agents with defaultMode fallback', () => {
    fs.writeFileSync(
      path.join(agentsDir, 'my-agent.md'),
      `---\nname: my-agent\ndescription: An agent\ncapabilities: [plan, execute]\ntools: [grep]\n---\nBehavior.`,
    );
    const agents = loadAgents(projectRoot);
    const mine = agents.find((a) => a.name === 'my-agent');
    expect(mine).toBeDefined();
    expect(mine?.defaultMode).toBe('balanced');
    expect(mine?.capabilities).toEqual(['plan', 'execute']);
  });

  it('dedups so project entries win over duplicates', () => {
    fs.writeFileSync(
      path.join(skillsDir, 'a.md'),
      `---\nname: dup\ndescription: first\n---\nfirst`,
    );
    fs.writeFileSync(
      path.join(skillsDir, 'b.md'),
      `---\nname: dup\ndescription: second\n---\nsecond`,
    );
    const skills = loadSkills(projectRoot);
    const dup = skills.filter((s) => s.name === 'dup');
    expect(dup.length).toBe(1);
    expect(dup[0].description).toBe('second');
  });
});
