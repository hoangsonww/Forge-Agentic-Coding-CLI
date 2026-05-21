/**
 * Unit tests for the plan approval queue manager.
 * Covers: enqueue, list, edit, decision recording, dequeue.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  listQueue,
  getEntry,
  applyPlanEdit,
  recordDecision,
  dequeue,
} from '../src/core/plan-approval.js';
import type { Plan } from '../src/types/index.js';

const makePlan = (id = 'task-1'): Plan => ({
  id,
  goal: 'test goal',
  mode: 'balanced',
  version: '1',
  createdAt: new Date().toISOString(),
  steps: [
    {
      id: 'step-1',
      type: 'edit_file',
      description: 'Create index.ts',
    },
    {
      id: 'step-2',
      type: 'run_tests',
      description: 'Run test suite',
    },
  ],
});

beforeEach(() => {
  dequeue('task-1');
  dequeue('task-2');
});

describe('enqueue', () => {
  it('adds an entry with pending status', () => {
    const entry = enqueue('task-1', makePlan());
    expect(entry.id).toBe('task-1');
    expect(entry.status).toBe('pending');
  });

  it('replaces an existing entry (idempotent re-enqueue)', () => {
    enqueue('task-1', makePlan());
    enqueue('task-1', makePlan());
    expect(listQueue().filter((e) => e.id === 'task-1')).toHaveLength(1);
  });
});

describe('getEntry', () => {
  it('returns the entry when it exists', () => {
    enqueue('task-1', makePlan());
    expect(getEntry('task-1')).toBeDefined();
  });

  it('returns undefined for unknown id', () => {
    expect(getEntry('does-not-exist')).toBeUndefined();
  });
});

describe('applyPlanEdit', () => {
  it('patches a step description', () => {
    enqueue('task-1', makePlan());
    const updated = applyPlanEdit({
      entryId: 'task-1',
      stepUpdates: [{ stepId: 'step-1', description: 'Updated description' }],
    });
    expect(updated).not.toBeNull();
    expect(updated!.plan.steps[0].description).toBe('Updated description');
  });

  it('reorders steps correctly', () => {
    enqueue('task-1', makePlan());
    const updated = applyPlanEdit({
      entryId: 'task-1',
      stepUpdates: [{ stepId: 'step-2', newIndex: 0 }],
    });
    expect(updated!.plan.steps[0].id).toBe('step-2');
    expect(updated!.plan.steps[1].id).toBe('step-1');
  });

  it('returns null for non-pending entry', () => {
    enqueue('task-1', makePlan());
    recordDecision('task-1', { action: 'approve' });
    const result = applyPlanEdit({
      entryId: 'task-1',
      stepUpdates: [{ stepId: 'step-1', description: 'Should not apply' }],
    });
    expect(result).toBeNull();
  });

  it('returns null for unknown entry', () => {
    expect(applyPlanEdit({ entryId: 'ghost', stepUpdates: [] })).toBeNull();
  });
});

describe('recordDecision', () => {
  it('marks entry as approved', () => {
    enqueue('task-1', makePlan());
    const result = recordDecision('task-1', { action: 'approve' });
    expect(result!.status).toBe('approved');
  });

  it('marks entry as rejected with feedback', () => {
    enqueue('task-1', makePlan());
    const result = recordDecision('task-1', {
      action: 'reject',
      feedback: 'Step order is wrong',
    });
    expect(result!.status).toBe('rejected');
    expect(result!.reviewerFeedback).toBe('Step order is wrong');
  });

  it('marks entry as revision_requested', () => {
    enqueue('task-1', makePlan());
    const result = recordDecision('task-1', {
      action: 'request_revision',
      feedback: 'Please add a lint step',
    });
    expect(result!.status).toBe('revision_requested');
  });

  it('returns null for unknown id', () => {
    expect(recordDecision('ghost', { action: 'approve' })).toBeNull();
  });

  it('returns null for non-pending entry', () => {
    enqueue('task-1', makePlan());
    recordDecision('task-1', { action: 'approve' });
    expect(recordDecision('task-1', { action: 'reject' })).toBeNull();
  });
});

describe('dequeue', () => {
  it('removes the entry', () => {
    enqueue('task-1', makePlan());
    expect(dequeue('task-1')).toBe(true);
    expect(getEntry('task-1')).toBeUndefined();
  });

  it('returns false for unknown id', () => {
    expect(dequeue('ghost')).toBe(false);
  });
});
