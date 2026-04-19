import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import prompts from 'prompts';
import { loadSkills } from '../../skills/loader';
import { loadAgents } from '../../skills/loader';
import { findProjectRoot } from '../../config/loader';
import { paths, ensureForgeHome } from '../../config/paths';
import { info, ok, tableOut, err, warn } from '../ui';
import { bootstrap } from '../bootstrap';
import { searchRegistry, installFromUrl } from '../../skills/marketplace';

export const skillsCommand = new Command('skills').description('Skills management.');

skillsCommand
  .command('list')
  .description('List available skills.')
  .action(() => {
    bootstrap();
    const root = findProjectRoot() ?? undefined;
    const skills = loadSkills(root);
    if (!skills.length) {
      info('No skills registered. Drop .md files into ~/.forge/skills/ or .forge/skills/.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['name', 'tools', 'tags', 'description'],
        skills.map((s) => [
          s.name,
          s.tools.join(','),
          s.tags.join(','),
          s.description.slice(0, 48),
        ]),
      ) + '\n',
    );
  });

skillsCommand
  .command('new <name>')
  .description('Scaffold a new skill file.')
  .option('--project', 'create in project .forge/skills instead of ~/.forge/skills', false)
  .action((name: string, opts) => {
    bootstrap();
    ensureForgeHome();
    const root = findProjectRoot() ?? process.cwd();
    const dir = opts.project ? path.join(root, '.forge', 'skills') : paths.skills;
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${name}.md`);
    if (fs.existsSync(target)) {
      err(`${target} already exists.`);
      return;
    }
    fs.writeFileSync(
      target,
      `---
name: ${name}
description: Describe what this skill does.
inputs:
  - file
tools:
  - read_file
  - write_file
tags:
  - custom
---

## Instructions

1. Step one.
2. Step two.
`,
    );
    ok(`Created ${target}`);
  });

skillsCommand
  .command('search <query>')
  .description('Search the skills registry (FORGE_SKILLS_REGISTRY).')
  .action(async (query: string) => {
    bootstrap();
    const hits = await searchRegistry(query);
    if (!hits.length) {
      info('No matches.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['name', 'description', 'url'],
        hits.map((h) => [h.name, h.description.slice(0, 48), h.url]),
      ) + '\n',
    );
  });

skillsCommand
  .command('install <name>')
  .description('Install a skill from a URL or the default registry.')
  .option('--url <u>', 'explicit https:// URL to a Markdown skill file')
  .option('--yes', 'install without prompting', false)
  .option('--overwrite', 'replace existing skill with the same name', false)
  .action(async (name: string, opts) => {
    bootstrap();
    let url: string | undefined = opts.url;
    if (!url) {
      const hits = await searchRegistry(name);
      const match = hits.find((h) => h.name === name);
      if (!match) {
        err(`Skill '${name}' not found in registry. Pass --url to install by hand.`);
        return;
      }
      url = match.url;
    }
    if (!opts.yes) {
      const resp = await prompts({
        type: 'confirm',
        name: 'go',
        message: `Install skill '${name}' from ${url}?`,
        initial: false,
      });
      if (!resp.go) {
        info('Cancelled.');
        return;
      }
    }
    try {
      const out = await installFromUrl(name, url, { overwrite: opts.overwrite });
      ok(`Installed → ${out.path}`);
      if (out.injectionFlagged)
        warn('Injection patterns detected in skill body; content was sanitized before saving.');
    } catch (e) {
      err(String(e));
    }
  });

export const agentsCommand = new Command('agents').description('Custom agents.');

agentsCommand
  .command('list')
  .description('List custom agents.')
  .action(() => {
    bootstrap();
    const root = findProjectRoot() ?? undefined;
    const agents = loadAgents(root);
    if (!agents.length) {
      info('No custom agents.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['name', 'default_mode', 'tools', 'skills', 'description'],
        agents.map((a) => [
          a.name,
          a.defaultMode,
          a.tools.join(','),
          a.skills.join(','),
          (a.description || '').slice(0, 48),
        ]),
      ) + '\n',
    );
  });
