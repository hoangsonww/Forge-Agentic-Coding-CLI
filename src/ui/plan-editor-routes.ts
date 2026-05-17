/**
 * REST endpoint stubs for the Interactive Plan Editor — Issue #8.
 *
 * Mount on the existing Express app in src/ui/server.ts:
 *
 *   import { registerPlanEditorRoutes } from './plan-editor-routes.js';
 *   registerPlanEditorRoutes(app);
 *
 * Endpoints
 * ---------
 *   GET   /api/approval-queue              — list all pending plan entries
 *   GET   /api/approval-queue/:id          — get a single entry
 *   PATCH /api/approval-queue/:id          — apply a sparse plan step edit
 *   POST  /api/approval-queue/:id/decision — approve / reject / request revision
 *
 * All responses follow { ok: boolean, data?: unknown, error?: string }.
 *
 * @author Akshat Raj <AkshatRaj00>
 */

import type { Request, Response, Express } from 'express';
import {
  listQueue,
  getEntry,
  applyPlanEdit,
  recordDecision,
} from '../core/plan-approval.js';
import type {
  PlanEditRequest,
  ApprovalDecision,
  PlanApprovalAction,
} from '../core/plan-approval.js';

const sendOk = (res: Response, data: unknown): void => {
  res.json({ ok: true, data });
};

const sendErr = (res: Response, status: number, message: string): void => {
  res.status(status).json({ ok: false, error: message });
};

const ALLOWED_ACTIONS: PlanApprovalAction[] = [
  'approve',
  'reject',
  'request_revision',
];

/**
 * Mount all plan-editor routes onto the given Express app.
 */
export const registerPlanEditorRoutes = (app: Express): void => {
  /** List all entries in the approval queue */
  app.get('/api/approval-queue', (_req: Request, res: Response) => {
    sendOk(res, listQueue());
  });

  /** Get a single approval queue entry */
  app.get('/api/approval-queue/:id', (req: Request, res: Response) => {
    const entry = getEntry(req.params.id);
    if (!entry) {
      sendErr(res, 404, `No queue entry found for id: ${req.params.id}`);
      return;
    }
    sendOk(res, entry);
  });

  /**
   * Apply a sparse patch to plan steps.
   * Body: { stepUpdates: StepUpdate[] }
   */
  app.patch('/api/approval-queue/:id', (req: Request, res: Response) => {
    const editReq: PlanEditRequest = {
      entryId: req.params.id,
      stepUpdates: (req.body as PlanEditRequest | undefined)?.stepUpdates ?? [],
    };
    const updated = applyPlanEdit(editReq);
    if (!updated) {
      sendErr(
        res,
        409,
        `Cannot edit entry ${req.params.id}: not found or not in pending state.`,
      );
      return;
    }
    sendOk(res, updated);
  });

  /**
   * Record an approval decision.
   * Body: { action: 'approve' | 'reject' | 'request_revision', feedback?: string }
   */
  app.post(
    '/api/approval-queue/:id/decision',
    (req: Request, res: Response) => {
      const decision = req.body as ApprovalDecision | undefined;
      if (!decision?.action) {
        sendErr(res, 400, 'Missing required field: action');
        return;
      }
      if (!ALLOWED_ACTIONS.includes(decision.action)) {
        sendErr(
          res,
          400,
          `Invalid action. Must be one of: ${ALLOWED_ACTIONS.join(', ')}`,
        );
        return;
      }
      const updated = recordDecision(req.params.id, decision);
      if (!updated) {
        sendErr(
          res,
          404,
          `No queue entry found for id: ${req.params.id}`,
        );
        return;
      }
      sendOk(res, updated);
    },
  );
};
