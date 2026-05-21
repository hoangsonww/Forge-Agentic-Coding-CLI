/**
 * Approval Queue Manager — MVP foundation for Issue #8.
 *
 * Manages pending plan approval entries in-memory. Each entry represents
 * a generated plan waiting for a dashboard user to approve, reject, or
 * request a revision before the agentic loop is allowed to execute.
 *
 * Design notes:
 * - Intentionally in-memory for the MVP (no persistence dependency).
 * - Uses the existing Plan/PlanStep types verbatim — no schema changes needed.
 * - Safe to call from the UI server and the core loop concurrently because
 *   all mutations are synchronous (Node.js single-threaded event loop).
 *
 * @author Akshat Raj <AkshatRaj00>
 */

import { Plan, PlanStep } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface ApprovalQueueEntry {
  id: string;
  plan: Plan;
  status: ApprovalStatus;
  enqueuedAt: string;
  updatedAt?: string;
  reviewerFeedback?: string;
}

export interface StepUpdate {
  stepId: string;
  description?: string;
  newIndex?: number;
}

export interface PlanEditRequest {
  entryId: string;
  stepUpdates?: StepUpdate[];
}

export type PlanApprovalAction = 'approve' | 'reject' | 'request_revision';

export interface ApprovalDecision {
  action: PlanApprovalAction;
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Queue manager
// ---------------------------------------------------------------------------

const _queue = new Map<string, ApprovalQueueEntry>();

const STATUS_MAP: Record<PlanApprovalAction, ApprovalStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_revision: 'revision_requested',
};

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

export const listQueue = (): ApprovalQueueEntry[] => Array.from(_queue.values());

export const getEntry = (id: string): ApprovalQueueEntry | undefined => _queue.get(id);

export const applyPlanEdit = (req: PlanEditRequest): ApprovalQueueEntry | null => {
  const entry = _queue.get(req.entryId);
  if (!entry || entry.status !== 'pending') return null;

  const steps: PlanStep[] = entry.plan.steps.map((s) => ({ ...s }));

  for (const update of req.stepUpdates ?? []) {
    const idx = steps.findIndex((s) => s.id === update.stepId);
    if (idx === -1) continue;

    if (update.description !== undefined) {
      steps[idx] = { ...steps[idx], description: update.description };
    }

    if (update.newIndex !== undefined && update.newIndex !== idx) {
      const [moved] = steps.splice(idx, 1);
      const target = Math.max(0, Math.min(update.newIndex, steps.length));
      steps.splice(target, 0, moved);
    }
  }

  const updated: ApprovalQueueEntry = {
    ...entry,
    plan: { ...entry.plan, steps },
    updatedAt: new Date().toISOString(),
  };
  _queue.set(req.entryId, updated);
  return updated;
};

export const recordDecision = (
  id: string,
  decision: ApprovalDecision,
): ApprovalQueueEntry | null => {
  const entry = _queue.get(id);
  if (!entry || entry.status !== 'pending') return null;

  const updated: ApprovalQueueEntry = {
    ...entry,
    status: STATUS_MAP[decision.action],
    reviewerFeedback: decision.feedback,
    updatedAt: new Date().toISOString(),
  };
  _queue.set(id, updated);
  return updated;
};

export const dequeue = (id: string): boolean => _queue.delete(id);
