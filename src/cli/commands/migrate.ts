/**
 * Migration command for applying pending SQLite schema migrations. This command ensures that the database schema is up to date with the latest version defined in the application. It checks for any pending migrations and applies them sequentially, updating the schema version accordingly. If there are no pending migrations, it informs the user that the database is already up to date.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { bootstrap } from '../bootstrap';
import { runMigrations } from '../../migrations/runner';
import { ok, info } from '../ui';

export const migrateCommand = new Command('migrate')
  .description('Apply pending SQLite schema migrations.')
  .action(() => {
    bootstrap();
    const res = runMigrations();
    if (res.applied === 0) info(`Database up to date (schema v${res.latest}).`);
    else ok(`Applied ${res.applied} migration(s) → schema v${res.latest}.`);
  });
