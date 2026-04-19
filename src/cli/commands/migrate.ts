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
