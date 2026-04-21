/**
 * Cost ledger commands. Supports showing cumulative totals and listing recent model calls with cost details.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { totals, recent } from '../../models/cost';
import { info, tableOut } from '../ui';

export const costCommand = new Command('cost').description('Model cost ledger.');

costCommand
  .command('totals')
  .description('Show cumulative token/cost totals.')
  .action(() => {
    bootstrap();
    const t = totals();
    info(`calls=${t.calls} tokens=${t.tokens} usd=$${t.usd.toFixed(4)}`);
  });

costCommand
  .command('recent')
  .description('List recent model calls with cost.')
  .option('-n, --limit <n>', 'limit', '25')
  .action((opts) => {
    bootstrap();
    const rows = recent(Number(opts.limit)) as Array<{
      provider: string;
      model: string;
      input_tokens: number;
      output_tokens: number;
      duration_ms: number;
      cost_usd: number;
      created_at: string;
    }>;
    if (!rows.length) {
      info('No model calls recorded yet.');
      return;
    }
    process.stdout.write(
      tableOut(
        ['provider', 'model', 'in_tok', 'out_tok', 'ms', 'usd', 'when'],
        rows.map((r) => [
          r.provider,
          r.model,
          r.input_tokens,
          r.output_tokens,
          r.duration_ms,
          r.cost_usd.toFixed(4),
          r.created_at,
        ]),
      ) + '\n',
    );
  });
