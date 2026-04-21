/**
 * This test suite ensures that the skills marketplace installation function properly guards against invalid URLs, such as those using the http:// protocol or non-URL strings. This is crucial for maintaining security and preventing potential vulnerabilities when users attempt to install skills from untrusted sources.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { installFromUrl } from '../../src/skills/marketplace';

describe('skills marketplace URL guard', () => {
  it('refuses http:// URLs', async () => {
    await expect(installFromUrl('x', 'http://example.com/x.md')).rejects.toThrow();
  });

  it('refuses non-URL strings', async () => {
    await expect(installFromUrl('x', 'not a url')).rejects.toThrow();
  });
});
