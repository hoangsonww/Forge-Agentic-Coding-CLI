/**
 * Spec command: run the agentic loop against a spec file (spec-driven development).
 * The spec file is a Markdown document that describes the feature to be developed, along with an optional list of sub-tasks to address in order. The command loads the spec, extracts the description and tasks, and then orchestrates a run of the agentic loop with the spec as input.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { loadSpec } from '../../core/spec';
import { orchestrateRun } from '../../core/orchestrator';
import { PermissionFlags } from '../../permissions/manager';
import { ok, err, info, dim } from '../ui';
import { Mode } from '../../types';

export const specCommand = new Command('spec')
  .description('Run the agentic loop against a spec file (spec-driven development).')
  .argument('<file>', 'path to the spec (Markdown)')
  .option('--mode <m>', 'mode', 'balanced')
  .option('--yes', 'auto-approve plan', false)
  .option('--plan-only', 'produce plan only', false)
  .option('--skip-permissions', 'skip routine prompts', false)
  .option('--allow-files', 'allow file writes', false)
  .option('--allow-shell', 'allow shell', false)
  .option('--strict', 'strict mode', false)
  .option('--deterministic', 'fixed temperature (reproducible)', false)
  .action(async (file: string, opts) => {
    bootstrap();
    try {
      const spec = loadSpec(file);
      info(`Spec: ${spec.title} (${spec.rawLength} chars, ${spec.tasks.length} listed sub-tasks)`);
      const description =
        spec.tasks.length > 0
          ? `${spec.description}\n\nSub-tasks to address in order:\n${spec.tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
          : spec.description;
      const flags: PermissionFlags = {
        skipRoutine: Boolean(opts.skipPermissions),
        allowFiles: Boolean(opts.allowFiles),
        allowShell: Boolean(opts.allowShell),
        strict: Boolean(opts.strict),
      };
      const mode: Mode = (opts.mode as Mode) ?? 'balanced';
      info(`mode=${dim(mode)}${opts.deterministic ? ' · deterministic' : ''}`);
      const result = await orchestrateRun({
        input: spec.description,
        title: spec.title,
        description,
        mode,
        autoApprove: Boolean(opts.yes),
        planOnly: Boolean(opts.planOnly),
        flags,
      });
      if (result.result.success) {
        ok(`Spec complete. ${result.result.summary}`);
      } else {
        err(`Spec failed: ${result.result.summary}`);
        process.exitCode = 1;
      }
    } catch (e) {
      err(`spec failed: ${String(e)}`);
      process.exitCode = 1;
    }
  });
