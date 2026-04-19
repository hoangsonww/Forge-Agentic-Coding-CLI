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
