import * as fs from 'fs';
import * as path from 'path';
import prompts from 'prompts';
import { Command } from 'commander';
import { ok, kv, warn, banner, divider, section, success } from '../ui';
import { ensureForgeHome, paths, projectConfigDir, ensureProjectDir } from '../../config/paths';
import { loadGlobalConfig, saveGlobalConfig, saveProjectConfig } from '../../config/loader';
import { initProviders } from '../../models/registry';
import { getProvider } from '../../models/provider';

export const initCommand = new Command('init')
  .description('Initialize Forge in the current project (and ~/.forge).')
  .option('--yes', 'accept defaults non-interactively', false)
  .option('--provider <name>', 'model provider (ollama|anthropic)')
  .action(async (opts) => {
    ensureForgeHome();
    process.stdout.write(banner());
    process.stdout.write(divider('initialize') + '\n\n');
    const cfg = loadGlobalConfig();

    if (!opts.yes) {
      const resp = await prompts([
        {
          type: 'select',
          name: 'provider',
          message: 'Default model provider',
          choices: [
            { title: 'Ollama (local)', value: 'ollama' },
            { title: 'Anthropic API (cloud)', value: 'anthropic' },
          ],
          initial: cfg.provider === 'anthropic' ? 1 : 0,
        },
        {
          type: 'select',
          name: 'mode',
          message: 'Default mode',
          choices: [
            { title: 'balanced', value: 'balanced' },
            { title: 'fast', value: 'fast' },
            { title: 'heavy', value: 'heavy' },
          ],
          initial: 0,
        },
        {
          type: 'toggle',
          name: 'autoCheck',
          message: 'Check for updates periodically?',
          initial: cfg.update.autoCheck,
          active: 'yes',
          inactive: 'no',
        },
      ]);
      saveGlobalConfig({
        ...cfg,
        provider: resp.provider ?? cfg.provider,
        defaultMode: resp.mode ?? cfg.defaultMode,
        update: { ...cfg.update, autoCheck: Boolean(resp.autoCheck) },
      });
    } else if (opts.provider) {
      saveGlobalConfig({ ...cfg, provider: opts.provider });
    }

    // Project-scope init
    const root = process.cwd();
    const dir = path.join(root, projectConfigDir);
    if (fs.existsSync(dir)) {
      warn(`${projectConfigDir}/ already exists — leaving project config untouched.`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
      saveProjectConfig(root, { version: '1', skills: { autoDiscover: true }, mcp: {} });
      fs.writeFileSync(
        path.join(dir, 'instructions.md'),
        `# Project instructions for Forge

Add any project-specific rules here. They are appended to every prompt.

Examples:
- Use TypeScript strict mode.
- Prefer async/await.
- Do not touch /legacy without asking.
`,
      );
      ok('Project initialized.');
    }
    ensureProjectDir(root);
    process.stdout.write(section('paths', '◈'));
    process.stdout.write(kv('forge home', paths.home) + '\n');
    process.stdout.write(kv('models', paths.models) + '\n');
    process.stdout.write(kv('skills', paths.skills) + '\n');
    process.stdout.write(kv('logs', paths.logs) + '\n');
    process.stdout.write(section('probe', '⚡'));

    // Probe provider availability
    initProviders();
    const provider = getProvider(loadGlobalConfig().provider);
    const available = await provider.isAvailable().catch(() => false);
    if (!available) {
      warn(
        `${provider.name} is not reachable. ` +
          (provider.name === 'ollama'
            ? 'Start it with `ollama serve`.'
            : 'Set ANTHROPIC_API_KEY or switch providers.'),
      );
    } else {
      ok(`${provider.name} is reachable.`);
    }
    process.stdout.write(
      '\n' +
        success('Forge is ready', [
          'forge run "your first task"',
          'forge ui start     # dashboard',
          'forge doctor       # re-check health',
        ]) +
        '\n',
    );
  });
