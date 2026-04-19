import * as path from 'path';
import * as fs from 'fs';
import { ForgeRuntimeError } from '../types/errors';

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
  const abs = path.resolve(policy.projectRoot, inputPath);
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
