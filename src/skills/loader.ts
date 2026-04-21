import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { SkillManifest, AgentManifest } from '../types';
import { paths, projectConfigDir } from '../config/paths';
import { log } from '../logging/logger';

/**
 * Loads skill and agent manifests from markdown files. Each file can optionally start with a YAML frontmatter section delimited by `---` lines, which is parsed for metadata. The metadata can include fields like `name`, `description`, `inputs`, `tools`, `tags` for skills, and `name`, `description`, `capabilities`, `default_mode`, `tools`, `skills` for agents. The body of the markdown file (after the frontmatter) is treated as the skill's body or agent's behavior. The loader looks for markdown files in both the global directories and the project-specific directories, with project files taking precedence over global ones in case of name conflicts.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const frontmatter = (raw: string): { meta: Record<string, unknown>; body: string } => {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  try {
    const meta = yaml.parse(m[1]) as Record<string, unknown>;
    return { meta: meta ?? {}, body: m[2] };
  } catch {
    return { meta: {}, body: m[2] };
  }
};

const coerceSkill = (filePath: string, raw: string): SkillManifest | null => {
  const { meta, body } = frontmatter(raw);
  const name = typeof meta.name === 'string' ? meta.name : path.basename(filePath, '.md');
  if (!name) return null;
  return {
    name,
    description: String(meta.description ?? ''),
    inputs: Array.isArray(meta.inputs) ? meta.inputs.map(String) : [],
    tools: Array.isArray(meta.tools) ? meta.tools.map(String) : [],
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    body: body.trim(),
  };
};

const coerceAgent = (filePath: string, raw: string): AgentManifest | null => {
  const { meta, body } = frontmatter(raw);
  const name = typeof meta.name === 'string' ? meta.name : path.basename(filePath, '.md');
  if (!name) return null;
  return {
    name,
    description: String(meta.description ?? ''),
    capabilities: Array.isArray(meta.capabilities) ? meta.capabilities.map(String) : [],
    defaultMode: (typeof meta.default_mode === 'string'
      ? meta.default_mode
      : 'balanced') as AgentManifest['defaultMode'],
    tools: Array.isArray(meta.tools) ? meta.tools.map(String) : [],
    skills: Array.isArray(meta.skills) ? meta.skills.map(String) : [],
    behavior: body.trim() || undefined,
  };
};

const listMarkdown = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
};

export const loadSkills = (projectRoot?: string): SkillManifest[] => {
  const out: SkillManifest[] = [];
  const dirs = [paths.skills];
  if (projectRoot) dirs.push(path.join(projectRoot, projectConfigDir, 'skills'));
  for (const dir of dirs) {
    for (const fp of listMarkdown(dir)) {
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const skill = coerceSkill(fp, raw);
        if (skill) out.push(skill);
      } catch (err) {
        log.warn('failed to load skill', { file: fp, err: String(err) });
      }
    }
  }
  // Dedup by name (project overrides global).
  const map = new Map<string, SkillManifest>();
  for (const s of out) map.set(s.name, s);
  return [...map.values()];
};

export const loadAgents = (projectRoot?: string): AgentManifest[] => {
  const out: AgentManifest[] = [];
  const dirs = [paths.agents];
  if (projectRoot) dirs.push(path.join(projectRoot, projectConfigDir, 'agents'));
  for (const dir of dirs) {
    for (const fp of listMarkdown(dir)) {
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const agent = coerceAgent(fp, raw);
        if (agent) out.push(agent);
      } catch (err) {
        log.warn('failed to load agent', { file: fp, err: String(err) });
      }
    }
  }
  const map = new Map<string, AgentManifest>();
  for (const a of out) map.set(a.name, a);
  return [...map.values()];
};
