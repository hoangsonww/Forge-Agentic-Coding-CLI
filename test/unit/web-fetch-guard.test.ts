/**
 * We test the webFetch guards in isolation to ensure that they correctly reject disallowed URLs. This is important for security, as allowing access to local resources or internal networks could lead to vulnerabilities. By testing these guards directly, we can verify that they function as intended and provide a layer of protection against potential misuse of the webFetch API.
 *
 * The tests cover:
 *   - Rejection of file:// URLs to prevent access to local files.
 *   - Rejection of localhost and loopback addresses to prevent access to local services.
 *   - Rejection of RFC1918 private IP ranges to prevent access to internal network resources.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
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
