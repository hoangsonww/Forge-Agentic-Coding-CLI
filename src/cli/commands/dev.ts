/**
 * Dev command for contributor workflows. Supports setup (installing dependencies and building), as well as individual steps like build, test, and lint. This command is intended to streamline common development tasks for contributors, providing a simple interface to get up and running quickly. Each subcommand runs a series of predefined steps, such as installing dependencies, building the project, running tests, or checking code style with ESLint and Prettier.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { bootstrap } from '../bootstrap';
import { ok, info, err } from '../ui';

export const devCommand = new Command('dev').description('Contributor workflows.');

dev('setup', 'Install dev dependencies and build.', [
  ['npm', ['install']],
  ['npm', ['run', 'build']],
  ['npm', ['test']],
]);

dev('build', 'Build Forge.', [['npm', ['run', 'build']]]);
dev('test', 'Run the test suite.', [['npm', ['test']]]);
dev('lint', 'Run ESLint + Prettier in check mode.', [
  ['npx', ['eslint', 'src/**/*.ts']],
  ['npx', ['prettier', '--check', 'src/**/*.ts', 'test/**/*.ts']],
]);

function dev(name: string, description: string, steps: Array<[string, string[]]>): void {
  devCommand
    .command(name)
    .description(description)
    .action(() => {
      bootstrap();
      const cwd = path.resolve(__dirname, '..', '..', '..');
      for (const [cmd, args] of steps) {
        info(`$ ${cmd} ${args.join(' ')}`);
        const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
        if (r.status !== 0) {
          err(`${cmd} exited with ${r.status}`);
          process.exitCode = r.status ?? 1;
          return;
        }
      }
      ok(`${name} complete.`);
    });
}
