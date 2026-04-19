import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { clearSession } from '../../permissions/manager';
import { ok, info } from '../ui';

export const permissionsCommand = new Command('permissions').description('Permission management.');

permissionsCommand
  .command('reset')
  .description('Clear all in-session permission grants.')
  .action(() => {
    bootstrap();
    clearSession();
    ok('Session permissions cleared.');
  });

permissionsCommand
  .command('list')
  .description('Show persisted project/global grants.')
  .action(() => {
    bootstrap();
    const { getDb } = require('../../persistence/index-db');
    const rows = getDb().prepare('SELECT * FROM permission_grants').all() as Array<{
      tool: string;
      project_id: string | null;
      scope: string;
      granted_at: string;
    }>;
    if (!rows.length) {
      info('No persisted grants.');
      return;
    }
    for (const r of rows) {
      process.stdout.write(
        `  ${r.tool.padEnd(16)} ${r.scope.padEnd(10)} project=${r.project_id ?? '*'} (since ${r.granted_at})\n`,
      );
    }
  });
