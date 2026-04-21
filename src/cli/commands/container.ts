/**
 * Container lifecycle management using Docker Compose or Podman Compose. The command provides subcommands to start (`up`), stop (`down`), view logs (`logs`), rebuild images (`rebuild`), and open a shell inside the core container (`shell`). It automatically detects whether Docker or Podman is available and uses the appropriate tool. The compose file is searched for in both the global installation directory and the current working directory, allowing flexibility in how users set up their environment. This command simplifies container management for Forge users, abstracting away the underlying containerization tool and providing a consistent interface for common operations.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { bootstrap } from '../bootstrap';
import { ok, err, info, warn } from '../ui';

const findCompose = (): { cmd: string; args: string[] } | null => {
  for (const c of ['docker', 'podman']) {
    const r = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (r.status === 0) {
      if (c === 'docker') {
        const dc = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
        if (dc.status === 0) return { cmd: 'docker', args: ['compose'] };
      }
      if (c === 'podman') {
        const pc = spawnSync('podman-compose', ['--version'], { stdio: 'ignore' });
        if (pc.status === 0) return { cmd: 'podman-compose', args: [] };
      }
    }
  }
  return null;
};

const composeFile = (): string | null => {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'docker', 'docker-compose.yml'),
    path.resolve(process.cwd(), 'docker', 'docker-compose.yml'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
};

export const containerCommand = new Command('container').description(
  'Container lifecycle (Docker / Podman).',
);

containerCommand
  .command('up')
  .description('Start containers (core + ui + ollama).')
  .action(() => {
    bootstrap();
    const runner = findCompose();
    if (!runner) {
      err('Neither docker compose nor podman-compose is available.');
      return;
    }
    const file = composeFile();
    if (!file) {
      err('docker/docker-compose.yml not found.');
      return;
    }
    const r = spawnSync(runner.cmd, [...runner.args, '-f', file, 'up', '-d'], { stdio: 'inherit' });
    if (r.status === 0) ok('Containers started.');
    else process.exitCode = r.status ?? 1;
  });

containerCommand
  .command('down')
  .description('Stop containers.')
  .action(() => {
    bootstrap();
    const runner = findCompose();
    const file = composeFile();
    if (!runner || !file) {
      warn('No compose runner or file; nothing to do.');
      return;
    }
    spawnSync(runner.cmd, [...runner.args, '-f', file, 'down'], { stdio: 'inherit' });
    ok('Containers stopped.');
  });

containerCommand
  .command('logs')
  .description('Follow container logs.')
  .option('--service <name>', 'limit to a service', '')
  .action((opts) => {
    bootstrap();
    const runner = findCompose();
    const file = composeFile();
    if (!runner || !file) return;
    const args = [...runner.args, '-f', file, 'logs', '-f'];
    if (opts.service) args.push(opts.service);
    spawnSync(runner.cmd, args, { stdio: 'inherit' });
  });

containerCommand
  .command('rebuild')
  .description('Rebuild container images.')
  .action(() => {
    bootstrap();
    const runner = findCompose();
    const file = composeFile();
    if (!runner || !file) return;
    spawnSync(runner.cmd, [...runner.args, '-f', file, 'build', '--no-cache'], {
      stdio: 'inherit',
    });
    info('Rebuilt.');
  });

containerCommand
  .command('shell')
  .description('Open a shell inside the forge-core container.')
  .action(() => {
    bootstrap();
    const runner = findCompose();
    const file = composeFile();
    if (!runner || !file) return;
    spawnSync(runner.cmd, [...runner.args, '-f', file, 'exec', 'forge-core', 'bash'], {
      stdio: 'inherit',
    });
  });
