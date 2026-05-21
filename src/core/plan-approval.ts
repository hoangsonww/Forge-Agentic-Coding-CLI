/**
 * Approval Queue Manager — MVP foundation for Issue #8.
 *
 * Manages pending plan approval entries in-memory. Each entry represents
 * a generated plan that is waiting for a dashboard user to approve, reject,
 * or request a revision before the agentic loop is allowed to execute.
 *
 * Design notes:
 *  - Intentionally in-memory for the MVP (no persistence dependency).
 *  - Uses the existing Plan/PlanStep types — no schema changes needed.
 *  - Safe to call from the UI server and the core loop concurrently because
 *    all mutations are synchronous (Node.js single-threaded event loop).
 *
 * @author Akshat Raj <AkshatRaj00>
 */

import { Plan } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface ApprovalQueueEntry {
  /** Unique entry id — same as the associated task id */
  id: string;
  /** The plan snapshot at the time it was enqueued */
  plan: Plan;
  /** Current decision status */
  status: ApprovalStatus;
  /** ISO timestamp when the entry was enqueued */
  enqueuedAt: string;
  /** ISO timestamp of the last status update, if any */
  updatedAt?: string;
  /** Optional free-text feedback from the reviewer (used for revision_requested / rejected) */
  reviewerFeedback?: string;
}

export interface PlanEditRequest {
  /** Target entry id */
  entryId: string;
  /** Sparse patch — only the fields the user changed */
  stepUpdates?: Array<{
    stepId: string;
    description?: string;
    /** New 0-based position in the step array */
    newIndex?: number;
  }>;
}

export type PlanApprovalAction = 'approve' | 'reject' | 'request_revision';

export interface ApprovalDecision {
  action: PlanApprovalAction;
  /** Required when action is 'reject' or 'request_revision' */
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Discriminated result types (avoids ambiguous null returns)
// ---------------------------------------------------------------------------

/** Returned by applyPlanEdit to distinguish 404 vs 409. */
export type PlanEditResult =
  | { ok: true; entry: ApprovalQueueEntry }
  | { ok: false; reason: 'not_found' | 'not_pending' };

/** Returned by recordDecision to distinguish 404 vs 409 (terminal state). */
export type DecisionResult =
  | { ok: true; entry: ApprovalQueueEntry }
  | { ok: false; reason: 'not_found' | 'terminal_state' };

// ---------------------------------------------------------------------------
// Queue manager
// ---------------------------------------------------------------------------

const _queue = new Map<string, ApprovalQueueEntry>();

/** Valid source states for each action (prevents terminal-state overwrite). */
const ALLOWED_SOURCE_STATES: Record<PlanApprovalAction, ApprovalStatus[]> = {
  approve: ['pending', 'revision_requested'],
  reject: ['pending', 'revision_requested'],
  request_revision: ['pending'],
};

/**
 * Add a plan to the approval queue.
 * Replaces any existing entry for the same id (idempotent re-enqueue).
 */
export const enqueue = (id: string, plan: Plan): ApprovalQueueEntry => {
  const entry: ApprovalQueueEntry = {
    id,
    plan,
    status: 'pending',
    enqueuedAt: new Date().toISOString(),
  };
  _queue.set(id, entry);
  return entry;
};

/** Return a snapshot of all entries currently in the queue. */
export const listQueue = (): ApprovalQueueEntry[] => Array.from(_queue.values());

/** Return a single entry by id, or undefined if not found. */
export const getEntry = (id: string): ApprovalQueueEntry | undefined => _queue.get(id);

/**
 * Apply a sparse patch to the plan steps of a pending entry.
 *
 * Returns a discriminated result:
 *  - { ok: true, entry }                   — patch applied (or no-op)
 *  - { ok: false, reason: 'not_found' }    — no entry with that id
 *  - { ok: false, reason: 'not_pending' }  — entry exists but is not pending
 */
export const applyPlanEdit = (req: PlanEditRequest): PlanEditResult => {
  const entry = _queue.get(req.entryId);
  if (!entry) return { ok: false, reason: 'not_found' };
  if (entry.status !== 'pending') return { ok: false, reason: 'not_pending' };

  let steps = [...entry.plan.steps];
  let changed = false;

  for (const update of req.stepUpdates ?? []) {
    const idx = steps.findIndex((s) => s.id === update.stepId);
    if (idx === -1) continue;

    if (update.description !== undefined && update.description !== steps[idx].description) {
      steps[idx] = { ...steps[idx], description: update.description };
      changed = true;
    }

    if (update.newIndex !== undefined && update.newIndex !== idx) {
      const [moved] = steps.splice(idx, 1);
      const clampedTarget = Math.max(0, Math.min(update.newIndex, steps.length));
      steps.splice(clampedTarget, 0, moved);
      changed = true;
    }
  }

  if (!changed) return { ok: true, entry };

  const updated: ApprovalQueueEntry = {
    ...entry,
    plan: { ...entry.plan, steps },
    updatedAt: new Date().toISOString(),
  };
  _queue.set(req.entryId, updated);
  return { ok: true, entry: updated };
};

/**
 * Record a reviewer decision (approve / reject / request_revision).
 *
 * Returns a discriminated result:
 *  - { ok: true, entry }                     — decision applied
 *  - { ok: false, reason: 'not_found' }      — no entry with that id
 *  - { ok: false, reason: 'terminal_state' } — entry already in a terminal state
 */
export const recordDecision = (id: string, decision: ApprovalDecision): DecisionResult => {
  const entry = _queue.get(id);
  if (!entry) return { ok: false, reason: 'not_found' };

  const allowed = ALLOWED_SOURCE_STATES[decision.action];
  if (!allowed.includes(entry.status)) {
    return { ok: false, reason: 'terminal_state' };
  }

  const statusMap: Record<PlanApprovalAction, ApprovalStatus> = {
    approve: 'approved',
    reject: 'rejected',
    request_revision: 'revision_requested',
  };

  const updated: ApprovalQueueEntry = {
    ...entry,
    status: statusMap[decision.action],
    reviewerFeedback: decision.feedback,
    updatedAt: new Date().toISOString(),
  };
  _queue.set(id, updated);
  return { ok: true, entry: updated };
};

/** Remove an entry from the queue (e.g. after the loop has consumed it). */
export const dequeue = (id: string): boolean => _queue.delete(id);
