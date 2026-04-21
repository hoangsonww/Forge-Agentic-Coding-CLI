/**
 * Model management commands. Supports listing available models across providers. This command allows users to see which models they can use with Ollama, along with details like context window size and supported roles, helping them choose the right model for their needs.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { listProviders } from '../../models/provider';
import { tableOut, info, warn } from '../ui';

export const modelCommand = new Command('model').description('Model management.');

modelCommand
  .command('list')
  .description('List available models across providers.')
  .action(async () => {
    bootstrap();
    const rows: Array<[string, string, string, string, string]> = [];
    for (const p of listProviders()) {
      try {
        const available = await p.isAvailable();
        if (!available) {
          rows.push([p.name, '(unavailable)', '—', '—', '—']);
          continue;
        }
        const models = await p.listModels();
        for (const m of models) {
          rows.push([p.name, m.id, m.class, String(m.contextTokens), m.roles.join(',')]);
        }
      } catch (err) {
        warn(`provider ${p.name}: ${String(err)}`);
      }
    }
    if (!rows.length) {
      info('No models available. Start Ollama or set ANTHROPIC_API_KEY.');
      return;
    }
    process.stdout.write(tableOut(['provider', 'model', 'class', 'context', 'roles'], rows) + '\n');
  });
