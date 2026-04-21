/**
 * Release artifact verification.
 *
 * Two layers:
 *   1) SHA-256 content digest against a published checksum manifest.
 *   2) Ed25519 signature of the manifest using a rotating set of trusted keys
 *      embedded at build time. This matches the Sigstore/minisign model —
 *      any signature on the manifest covers every file listed in it.
 *
 * If verification fails the download is refused and the existing binary is
 * retained. `FORGE_ALLOW_UNSIGNED=1` is supported for development only and
 * emits a loud warning.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import * as fs from 'fs';
import * as crypto from 'crypto';
import { log } from '../logging/logger';

export interface Manifest {
  version: string;
  channel: 'stable' | 'beta' | 'nightly';
  releasedAt: string;
  artifacts: Array<{ name: string; sha256: string; size: number }>;
}

export interface TrustedKey {
  id: string;
  publicKey: string; // base64-encoded Ed25519 public key (raw, 32 bytes)
  addedAt: string;
  rotatedOutAt?: string;
}

// Trusted keys are maintained in src/release/trusted-keys.json (shipped with
// the binary). Rotations are additive: old keys retain trust for a window
// after a new key is introduced.
export const loadTrustedKeys = (): TrustedKey[] => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('./trusted-keys.json') as TrustedKey[];
    return raw.filter((k) => !k.rotatedOutAt || new Date(k.rotatedOutAt) > new Date());
  } catch {
    return [];
  }
};

export const verifyFileSha256 = (filePath: string, expected: string): boolean => {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  const digest = hash.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(expected, 'hex'));
};

export const verifyManifestSignature = (
  manifestJson: string,
  signatureBase64: string,
  keys: TrustedKey[] = loadTrustedKeys(),
): { valid: boolean; keyId?: string } => {
  if (!keys.length) {
    if (process.env.FORGE_ALLOW_UNSIGNED === '1') {
      log.warn('[release] FORGE_ALLOW_UNSIGNED=1 — skipping signature verification');
      return { valid: true, keyId: 'unsigned-override' };
    }
    return { valid: false };
  }
  const signature = Buffer.from(signatureBase64, 'base64');
  for (const k of keys) {
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'), // DER prefix for Ed25519
          Buffer.from(k.publicKey, 'base64'),
        ]),
        format: 'der',
        type: 'spki',
      });
      const ok = crypto.verify(null, Buffer.from(manifestJson, 'utf8'), publicKey, signature);
      if (ok) return { valid: true, keyId: k.id };
    } catch (err) {
      log.debug('key verify failed', { id: k.id, err: String(err) });
    }
  }
  return { valid: false };
};

export interface VerifyRequest {
  artifactPath: string;
  expectedName: string;
  manifest: Manifest;
  manifestJson: string;
  signatureBase64?: string;
}

export const verifyRelease = (req: VerifyRequest): { ok: boolean; detail: string } => {
  const entry = req.manifest.artifacts.find((a) => a.name === req.expectedName);
  if (!entry) {
    return { ok: false, detail: `artifact ${req.expectedName} not listed in manifest` };
  }
  if (!verifyFileSha256(req.artifactPath, entry.sha256)) {
    return { ok: false, detail: 'sha256 mismatch' };
  }
  if (!req.signatureBase64) {
    if (process.env.FORGE_ALLOW_UNSIGNED === '1') {
      log.warn('[release] FORGE_ALLOW_UNSIGNED=1 — allowing missing signature');
      return { ok: true, detail: 'sha256 ok (unsigned override)' };
    }
    return { ok: false, detail: 'manifest signature missing' };
  }
  const sig = verifyManifestSignature(req.manifestJson, req.signatureBase64);
  if (!sig.valid) {
    return { ok: false, detail: 'signature invalid' };
  }
  return { ok: true, detail: `sha256 + signature ok (key: ${sig.keyId})` };
};
