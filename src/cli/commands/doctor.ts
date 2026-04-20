import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { bootstrap } from '../bootstrap';
import { listProviders } from '../../models/provider';
import { isLocalProvider, resolveLocalModel } from '../../models/adapter';
import { banner, divider, section, kv, success, attention, PALETTE } from '../ui';
import { paths } from '../../config/paths';
import { loadGlobalConfig } from '../../config/loader';
import { getDb } from '../../persistence/index-db';
import { daemonStatus } from '../../daemon/control';
import { runCommand } from '../../sandbox/shell';
import { ModelRole } from '../../types';

interface Check {
  name: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

const checks: Check[] = [
  {
    name: 'forge home',
    run: async () => ({ ok: fs.existsSync(paths.home), detail: paths.home }),
  },
  {
    name: 'sqlite index',
    run: async () => {
      try {
        getDb().prepare('SELECT 1').get();
        return { ok: true, detail: paths.globalIndex };
      } catch (e) {
        return { ok: false, detail: String(e) };
      }
    },
  },
  {
    name: 'config valid',
    run: async () => {
      try {
        const cfg = loadGlobalConfig();
        return { ok: true, detail: `provider=${cfg.provider} mode=${cfg.defaultMode}` };
      } catch (e) {
        return { ok: false, detail: String(e) };
      }
    },
  },
  {
    name: 'providers',
    run: async () => {
      const results: string[] = [];
      for (const p of listProviders()) {
        try {
          results.push(`${p.name}:${(await p.isAvailable()) ? 'up' : 'down'}`);
        } catch {
          results.push(`${p.name}:error`);
        }
      }
      const anyUp = results.some((r) => r.endsWith(':up'));
      return { ok: anyUp, detail: results.join(' ') };
    },
  },
  {
    name: 'git available',
    run: async () => {
      try {
        const r = await runCommand('git --version', { cwd: process.cwd(), timeoutMs: 3000 });
        return { ok: r.exitCode === 0, detail: r.stdout.trim() };
      } catch (e) {
        return { ok: false, detail: String(e) };
      }
    },
  },
  {
    name: 'daemon',
    run: async () => {
      const s = daemonStatus();
      return { ok: true, detail: s.running ? `running (pid ${s.pid})` : 'stopped (optional)' };
    },
  },
];

export const doctorCommand = new Command('doctor')
  .description('Diagnose installation health.')
  .option('--no-banner', 'omit the banner', false)
  .action(async (opts) => {
    bootstrap();
    if (opts.banner !== false) process.stdout.write(banner());
    process.stdout.write(divider('health check') + '\n\n');
    let allOk = true;
    for (const c of checks) {
      const res = await c.run();
      const icon = res.ok ? chalk.green('✔') : chalk.red('✖');
      const label = chalk.bold(c.name);
      process.stdout.write(`  ${icon}  ${label}\n`);
      process.stdout.write(kv('   ↳', res.detail) + '\n');
      if (!res.ok) allOk = false;
    }

    process.stdout.write(section('paths', '◈'));
    for (const [k, v] of Object.entries(paths).slice(0, 8)) {
      process.stdout.write(kv(k, String(v)) + '\n');
    }

    // Role → model mapping for each local provider. Helps users confirm
    // that Forge has picked something sensible from what they've pulled.
    const cfg = loadGlobalConfig();
    const roles: ModelRole[] = ['fast', 'executor', 'planner', 'architect', 'reviewer'];
    process.stdout.write(section('model routing', '◆'));
    for (const p of listProviders()) {
      let up = false;
      try {
        up = await p.isAvailable();
      } catch {
        up = false;
      }
      if (!up) {
        process.stdout.write(kv(p.name, chalk.dim('(unavailable — skipped)')) + '\n');
        continue;
      }
      process.stdout.write(chalk.bold(`  ${p.name}\n`));
      for (const role of roles) {
        let model: string;
        try {
          if (p.name === 'anthropic') {
            model = cfg.anthropic.model;
          } else if (isLocalProvider(p.name)) {
            const configured =
              role === 'fast'
                ? cfg.models.fast
                : role === 'executor'
                  ? cfg.models.code
                  : role === 'planner'
                    ? cfg.models.planner
                    : cfg.models.balanced;
            model = await resolveLocalModel(p, role, configured);
          } else {
            model = '(provider resolves its own)';
          }
        } catch (err) {
          model = `(error: ${String(err).slice(0, 60)})`;
        }
        process.stdout.write(kv(`   ${role}`, model) + '\n');
      }
    }

    process.stdout.write('\n');
    if (allOk) {
      process.stdout.write(
        success('All checks passed', [chalk.dim('try: forge run "…your task…"')]) + '\n',
      );
    } else {
      // Probe providers one more time so we can tell the user *which* check
      // tripped and how to fix it without digging through the list above.
      const names = listProviders().map((p) => p.name);
      const anyUp = (
        await Promise.all(
          listProviders().map(async (p) => {
            try {
              return await p.isAvailable();
            } catch {
              return false;
            }
          }),
        )
      ).some(Boolean);
      if (!anyUp) {
        process.stdout.write(
          attention(`No model provider is reachable (tried: ${names.join(', ')})`, [
            'Start one of:  `ollama serve`  ·  LM Studio → Start Server  ·  `vllm serve <model>`  ·  `llama-server …`',
            'Or export:     ANTHROPIC_API_KEY  ·  OPENAI_API_KEY  ·  OPENAI_BASE_URL',
            'Then:          forge doctor',
          ]) + '\n',
        );
      } else {
        process.stdout.write(
          attention('Some checks failed', ['run: forge config path', 'or:  forge init']) + '\n',
        );
      }
      process.exitCode = 1;
    }
    // Silence unused-import warnings for optional helpers loaded for side-effect.
    void PALETTE;
  });
