/**
 * Permission management commands. Supports resetting in-session grants and listing persisted grants. This command allows users to manage the permissions that have been granted to tools, both for the current session and those that have been persisted across sessions, giving them control over what tools can access and for which projects.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { clearSession } from '../../permissions/manager';
import { getDb } from '../../persistence/index-db';
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
