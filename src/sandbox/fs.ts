/**
 * Sandboxed filesystem access. Provides utilities to resolve paths safely within a sandbox defined by a project root and optional extra allowed roots. The main function is `resolveSafe`, which checks that a given path is within the allowed scope and does not access any permanently forbidden locations. This is used to implement the sandboxing mechanism for actions, ensuring they cannot read or write files outside their designated area.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ForgeRuntimeError } from '../types/errors';

// `~` is shell syntax; Node treats it as a literal directory name. LLMs
// routinely produce paths like `~/project/src/file.ts` when the user
// mentions a home-relative directory, and without pre-expansion those get
// joined against the project root as `<root>/~/project/src/file.ts` — the
// exact ENOENT noise users see. Expanding here means the resolved absolute
// path still goes through the regular `allowedRoots` containment check
// below, so sandbox guarantees are unchanged.
const expandTilde = (p: string): string => {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~' + path.sep)) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
};

// Paths we NEVER allow regardless of scope configuration.
const ALWAYS_FORBIDDEN = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/.ssh/id_rsa',
  '/.ssh/id_dsa',
  '/.aws/credentials',
  '/System',
  '/boot',
  '/sys',
  '/proc/kcore',
];

export interface SandboxPolicy {
  projectRoot: string;
  readExtraRoots?: string[];
  writeExtraRoots?: string[];
  allowHome?: boolean;
  allowTmp?: boolean;
}

const within = (base: string, target: string): boolean => {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export const resolveSafe = (
  inputPath: string,
  policy: SandboxPolicy,
  mode: 'read' | 'write',
): string => {
  const abs = path.resolve(policy.projectRoot, expandTilde(inputPath));
  const normalized = path.normalize(abs);

  for (const forbidden of ALWAYS_FORBIDDEN) {
    if (normalized.includes(forbidden)) {
      throw new ForgeRuntimeError({
        class: 'sandbox_violation',
        message: `Access to ${forbidden} is permanently denied.`,
        retryable: false,
      });
    }
  }

  // Refuse symlink escapes. Resolve real path once the file exists; for
  // missing files, resolve the parent.
  let realPath: string;
  try {
    realPath = fs.existsSync(normalized)
      ? fs.realpathSync(normalized)
      : path.join(fs.realpathSync(path.dirname(normalized)), path.basename(normalized));
  } catch {
    realPath = normalized;
  }

  const projectReal = fs.realpathSync(policy.projectRoot);
  const allowedRoots = [projectReal];
  const extraRead = policy.readExtraRoots ?? [];
  const extraWrite = policy.writeExtraRoots ?? [];
  if (mode === 'read') allowedRoots.push(...extraRead, ...extraWrite);
  else allowedRoots.push(...extraWrite);
  if (policy.allowTmp) allowedRoots.push('/tmp', '/private/tmp');
  if (policy.allowHome && process.env.HOME) allowedRoots.push(process.env.HOME);

  const ok = allowedRoots.some((root) => within(path.resolve(root), realPath));
  if (!ok) {
    throw new ForgeRuntimeError({
      class: 'sandbox_violation',
      message: `Path ${realPath} is outside sandbox (mode=${mode}).`,
      retryable: false,
      recoveryHint: 'Request access via --allow-extra-root or scope the action inside the project.',
    });
  }
  return realPath;
};

export const isPathSafe = (
  inputPath: string,
  policy: SandboxPolicy,
  mode: 'read' | 'write',
): boolean => {
  try {
    resolveSafe(inputPath, policy, mode);
    return true;
  } catch {
    return false;
  }
};
