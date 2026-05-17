/**
 * REST endpoint stubs for the Interactive Plan Editor — Issue #8.
 *
 * These handlers are designed to be mounted on the existing Express app in
 * src/ui/server.ts with a single line:
 *
 *   import { registerPlanEditorRoutes } from './plan-editor-routes';
 *   registerPlanEditorRoutes(app);
 *
 * Endpoints
 * ---------
 *   GET  /api/approval-queue          — list all pending plan entries
 *   GET  /api/approval-queue/:id      — get a single entry
 *   PATCH /api/approval-queue/:id     — apply a sparse plan step edit
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
  PlanEditRequest,
  ApprovalDecision,
} from '../core/plan-approval';

const ok = (res: Response, data: unknown) =>
  res.json({ ok: true, data });

const err = (res: Response, status: number, message: string) =>
  res.status(status).json({ ok: false, error: message });

/**
 * Mount all plan-editor routes onto the given Express app.
 */
export const registerPlanEditorRoutes = (app: Express): void => {

  /** List all entries in the approval queue */
  app.get('/api/approval-queue', (_req: Request, res: Response) => {
    ok(res, listQueue());
  });

  /** Get a single approval queue entry */
  app.get('/api/approval-queue/:id', (req: Request, res: Response) => {
    const entry = getEntry(req.params.id);
    if (!entry) return err(res, 404, `No queue entry found for id: ${req.params.id}`);
    ok(res, entry);
  });

  /**
   * Apply a sparse patch to plan steps.
   * Body: PlanEditRequest (stepUpdates array)
   */
  app.patch('/api/approval-queue/:id', (req: Request, res: Response) => {
    const editReq: PlanEditRequest = {
      entryId: req.params.id,
      stepUpdates: req.body?.stepUpdates ?? [],
    };
    const updated = applyPlanEdit(editReq);
    if (!updated) {
      return err(
        res,
        409,
        `Cannot edit entry ${req.params.id}: not found or not in pending state.`,
      );
    }
    ok(res, updated);
  });

  /**
   * Record an approval decision.
   * Body: ApprovalDecision { action: 'approve' | 'reject' | 'request_revision', feedback? }
   */
  app.post('/api/approval-queue/:id/decision', (req: Request, res: Response) => {
    const decision: ApprovalDecision = req.body;
    if (!decision?.action) {
      return err(res, 400, 'Missing required field: action');
    }
    const allowed: ApprovalDecision['action'][] = ['approve', 'reject', 'request_revision'];
    if (!allowed.includes(decision.action)) {
      return err(res, 400, `Invalid action. Must be one of: ${allowed.join(', ')}`);
    }
    const updated = recordDecision(req.params.id, decision);
    if (!updated) {
      return err(res, 404, `No queue entry found for id: ${req.params.id}`);
    }
    ok(res, updated);
  });
};
