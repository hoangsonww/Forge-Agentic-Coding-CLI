/**
 * Secret storage with best-effort OS keychain integration and an encrypted
 * file-based fallback. The keychain integrations shell out to well-known
 * utilities (security on macOS, secret-tool on Linux) so we don't carry
 * native-module risk in the hot path.
 *
 * Storage model:
 *   - Key is `service::account`
 *   - Value is a UTF-8 string (we encrypt it before writing regardless)
 *   - Fallback: AES-256-GCM at `~/.forge/mcp/tokens/<service-account>.enc`
 *     keyed off a machine-local key saved with user-only permissions.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { paths, ensureForgeHome } from '../config/paths';
import { log } from '../logging/logger';
import { isWindowsKeychainAvailable, winSet, winGet, winDelete } from './windows';

const SERVICE_PREFIX = 'com.forge.cli';
const KEY_FILE = path.join(paths.home, '.keyfile');

const ensureKey = (): Buffer => {
  ensureForgeHome();
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
};

const encrypt = (plaintext: string): Buffer => {
  const key = ensureKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
};

const decrypt = (blob: Buffer): string => {
  const key = ensureKey();
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
};

const tokenFile = (service: string, account: string): string => {
  const safe = `${service}-${account}`.replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(paths.mcpTokens, `${safe}.enc`);
};

const saveFallback = (service: string, account: string, value: string): void => {
  fs.mkdirSync(paths.mcpTokens, { recursive: true });
  fs.writeFileSync(tokenFile(service, account), encrypt(value), { mode: 0o600 });
};

const loadFallback = (service: string, account: string): string | null => {
  const fp = tokenFile(service, account);
  if (!fs.existsSync(fp)) return null;
  try {
    return decrypt(fs.readFileSync(fp));
  } catch (err) {
    log.warn('keychain: failed to decrypt fallback token', { err: String(err) });
    return null;
  }
};

const deleteFallback = (service: string, account: string): boolean => {
  const fp = tokenFile(service, account);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
};

// ---- macOS ----
const macSet = (service: string, account: string, value: string): boolean => {
  const r = spawnSync(
    'security',
    [
      'add-generic-password',
      '-U',
      '-s',
      `${SERVICE_PREFIX}.${service}`,
      '-a',
      account,
      '-w',
      value,
    ],
    { encoding: 'utf8' },
  );
  return r.status === 0;
};
const macGet = (service: string, account: string): string | null => {
  const r = spawnSync(
    'security',
    ['find-generic-password', '-s', `${SERVICE_PREFIX}.${service}`, '-a', account, '-w'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
};
const macDel = (service: string, account: string): boolean => {
  const r = spawnSync('security', [
    'delete-generic-password',
    '-s',
    `${SERVICE_PREFIX}.${service}`,
    '-a',
    account,
  ]);
  return r.status === 0;
};

// ---- Linux (secret-tool) ----
const linuxSet = (service: string, account: string, value: string): boolean => {
  const r = spawnSync(
    'secret-tool',
    [
      'store',
      '--label',
      `Forge: ${service}`,
      'service',
      `${SERVICE_PREFIX}.${service}`,
      'account',
      account,
    ],
    { input: value, encoding: 'utf8' },
  );
  return r.status === 0;
};
const linuxGet = (service: string, account: string): string | null => {
  const r = spawnSync(
    'secret-tool',
    ['lookup', 'service', `${SERVICE_PREFIX}.${service}`, 'account', account],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
};
const linuxDel = (service: string, account: string): boolean => {
  const r = spawnSync('secret-tool', [
    'clear',
    'service',
    `${SERVICE_PREFIX}.${service}`,
    'account',
    account,
  ]);
  return r.status === 0;
};

const hasCommand = (cmd: string): boolean => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'command', ['-v', cmd], {
    encoding: 'utf8',
  });
  return r.status === 0;
};

const useNative = (): 'mac' | 'linux' | 'windows' | 'none' => {
  if (process.platform === 'darwin' && hasCommand('security')) return 'mac';
  if (process.platform === 'linux' && hasCommand('secret-tool')) return 'linux';
  if (process.platform === 'win32' && isWindowsKeychainAvailable()) return 'windows';
  return 'none';
};

export const setSecret = (service: string, account: string, value: string): void => {
  const mode = useNative();
  let ok = false;
  if (mode === 'mac') ok = macSet(service, account, value);
  else if (mode === 'linux') ok = linuxSet(service, account, value);
  else if (mode === 'windows') ok = winSet(service, account, value);
  if (!ok) {
    log.debug('keychain: using encrypted fallback', { service, account, mode });
    saveFallback(service, account, value);
  } else {
    deleteFallback(service, account);
  }
};

export const getSecret = (service: string, account: string): string | null => {
  const mode = useNative();
  if (mode === 'mac') {
    const v = macGet(service, account);
    if (v) return v;
  } else if (mode === 'linux') {
    const v = linuxGet(service, account);
    if (v) return v;
  } else if (mode === 'windows') {
    const v = winGet(service, account);
    if (v) return v;
  }
  return loadFallback(service, account);
};

export const deleteSecret = (service: string, account: string): boolean => {
  const mode = useNative();
  let ok = false;
  if (mode === 'mac') ok = macDel(service, account);
  else if (mode === 'linux') ok = linuxDel(service, account);
  else if (mode === 'windows') ok = winDelete(service, account);
  const fallbackOk = deleteFallback(service, account);
  return ok || fallbackOk;
};

export const keychainStatus = (): { backend: string; home: string } => ({
  backend: useNative(),
  home: os.homedir(),
});
