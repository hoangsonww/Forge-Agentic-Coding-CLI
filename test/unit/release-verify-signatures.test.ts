/**
 * Release Signature Verification Tests.
 *
 * Complements release-verify.test.ts (which pins the sha256 and
 * missing-signature paths) by exercising the Ed25519 verification
 * branch end-to-end. We generate a real keypair, sign a real manifest,
 * then verify it through the production code.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { verifyManifestSignature, type TrustedKey } from '../../src/release/verify';

const generateEd25519 = (): { trustedKey: TrustedKey; privateKey: crypto.KeyObject } => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // The last 32 bytes of the SPKI DER for Ed25519 are the raw public key.
  const raw = spki.subarray(spki.length - 32);
  return {
    trustedKey: {
      id: 'sig-test',
      publicKey: raw.toString('base64'),
      addedAt: new Date().toISOString(),
    },
    privateKey,
  };
};

const sign = (priv: crypto.KeyObject, payload: string): string =>
  crypto.sign(null, Buffer.from(payload, 'utf8'), priv).toString('base64');

describe('verifyManifestSignature', () => {
  const oldEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...oldEnv };
  });

  it('accepts a signature produced by a trusted key', () => {
    const { trustedKey, privateKey } = generateEd25519();
    const manifest = JSON.stringify({ version: '1.2.3', artifacts: [] });
    const sig = sign(privateKey, manifest);
    const r = verifyManifestSignature(manifest, sig, [trustedKey]);
    expect(r.valid).toBe(true);
    expect(r.keyId).toBe('sig-test');
  });

  it('rejects a signature from an unknown key', () => {
    const { privateKey } = generateEd25519();
    const { trustedKey: other } = generateEd25519();
    const manifest = JSON.stringify({ version: '1.2.3', artifacts: [] });
    const sig = sign(privateKey, manifest);
    const r = verifyManifestSignature(manifest, sig, [other]);
    expect(r.valid).toBe(false);
  });

  it('accepts any valid signer when multiple trusted keys are configured', () => {
    const a = generateEd25519();
    const b = generateEd25519();
    const manifest = JSON.stringify({ v: 1 });
    // Sign with b's key; verify against a list containing both.
    const sig = sign(b.privateKey, manifest);
    const r = verifyManifestSignature(manifest, sig, [a.trustedKey, b.trustedKey]);
    expect(r.valid).toBe(true);
    expect(r.keyId).toBe('sig-test');
  });

  it('rejects when no trusted keys are configured (prod)', () => {
    delete process.env.FORGE_ALLOW_UNSIGNED;
    const r = verifyManifestSignature('{}', 'c2ln', []);
    expect(r.valid).toBe(false);
  });

  it('FORGE_ALLOW_UNSIGNED=1 opens the dev escape hatch', () => {
    process.env.FORGE_ALLOW_UNSIGNED = '1';
    const r = verifyManifestSignature('{}', 'c2ln', []);
    expect(r.valid).toBe(true);
    expect(r.keyId).toBe('unsigned-override');
  });
});
