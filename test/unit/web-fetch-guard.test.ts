import { describe, it, expect } from 'vitest';
import { webFetch } from '../../src/web/fetch';
import { ForgeRuntimeError } from '../../src/types/errors';

describe('webFetch guards', () => {
  it('rejects file:// URLs', async () => {
    await expect(webFetch({ url: 'file:///etc/passwd' })).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('rejects localhost / loopback', async () => {
    await expect(webFetch({ url: 'http://localhost:8080/' })).rejects.toBeInstanceOf(
      ForgeRuntimeError,
    );
  });

  it('rejects 127.* addresses', async () => {
    await expect(webFetch({ url: 'http://127.0.0.1/' })).rejects.toBeInstanceOf(ForgeRuntimeError);
  });

  it('rejects RFC1918 ranges', async () => {
    await expect(webFetch({ url: 'http://10.0.0.1/' })).rejects.toBeInstanceOf(ForgeRuntimeError);
    await expect(webFetch({ url: 'http://192.168.1.1/' })).rejects.toBeInstanceOf(
      ForgeRuntimeError,
    );
  });
});
