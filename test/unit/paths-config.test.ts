/**
 * Config Paths Tests.
 *
 * Verifies projectId hashing is stable and deterministic for a given
 * absolute path, and that projectSubdirs returns the expected layout.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { projectId, projectDir, projectSubdirs, paths as forgePaths } from '../../src/config/paths';

describe('paths', () => {
  it('projectId is deterministic for the same absolute path', () => {
    const a = projectId('/some/path/to/project');
    const b = projectId('/some/path/to/project');
    expect(a).toBe(b);
    expect(a.length).toBe(16);
  });

  it('projectId differs across distinct paths', () => {
    expect(projectId('/a')).not.toBe(projectId('/b'));
  });

  it('projectId normalizes the input path', () => {
    // `/x/../x/y` resolves to `/x/y` — same hash as `/x/y`.
    expect(projectId('/x/y')).toBe(projectId('/x/../x/y'));
  });

  it('projectDir nests the id under the projects root', () => {
    const root = '/project/abs';
    const dir = projectDir(root);
    expect(dir.startsWith(forgePaths.projects)).toBe(true);
    expect(path.basename(dir)).toBe(projectId(root));
  });

  it('projectSubdirs returns the full layout with tasks/sessions/logs/memory/metadata', () => {
    const root = '/project/abs';
    const sub = projectSubdirs(root);
    expect(sub.tasks).toContain('tasks');
    expect(sub.sessions).toContain('sessions');
    expect(sub.logs).toContain('logs');
    expect(sub.memory).toContain('memory');
    expect(sub.metadata.endsWith('metadata.json')).toBe(true);
  });
});
