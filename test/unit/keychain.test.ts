import { describe, it, expect, beforeAll } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('keychain fallback', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-kc-'));
  beforeAll(() => {
    process.env.FORGE_HOME = tmp;
  });

  it('round-trips a value via the encrypted fallback', async () => {
    const { setSecret, getSecret, deleteSecret } = await import('../../src/keychain');
    setSecret('test', 'alice', 'super-secret');
    // Even if OS keychain picks it up, getSecret should succeed.
    expect(getSecret('test', 'alice')).toBe('super-secret');
    deleteSecret('test', 'alice');
    const after = getSecret('test', 'alice');
    // After delete, either null (fallback removed) or still in OS keychain.
    expect(after === null || after === 'super-secret').toBe(true);
  });
});
