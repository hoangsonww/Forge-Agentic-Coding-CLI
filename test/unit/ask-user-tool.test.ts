/**
 * Ask User Tool Tests.
 *
 * In unit tests stdin is not a TTY, so the non-interactive branch runs.
 * These tests pin that branch's behavior: honor nonInteractiveDefault
 * when provided, error when absent.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import { askUserTool } from '../../src/tools/ask-user';

const ctx = {
  taskId: 't',
  projectId: 'p',
  projectRoot: '/tmp/fake',
  traceId: 'r',
  runId: 'r',
};

describe('ask_user tool (non-interactive)', () => {
  it('returns the default when provided', async () => {
    const r = await askUserTool.execute(
      { question: 'proceed?', nonInteractiveDefault: 'yes' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.output?.answer).toBe('yes');
  });

  it('errors when no default is provided', async () => {
    const r = await askUserTool.execute({ question: 'proceed?' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
  });

  it('rejects an empty question with a non-retryable user_input error', async () => {
    const r = await askUserTool.execute({ question: '', nonInteractiveDefault: 'y' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
    expect(r.error?.retryable).toBe(false);
  });

  it('rejects too-short questions so the executor switches tools', async () => {
    const r = await askUserTool.execute({ question: '??', nonInteractiveDefault: 'y' }, ctx);
    expect(r.success).toBe(false);
    expect(r.error?.class).toBe('user_input');
  });
});
