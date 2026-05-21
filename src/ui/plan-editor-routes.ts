/**
 * REST handlers for the Interactive Plan Editor — Issue #8.
 *
 * These handlers follow the same pattern as the existing routes in
 * src/ui/server.ts: they receive a native Node.js IncomingMessage +
 * ServerResponse pair and use the shared sendJson / parseJson helpers.
 *
 * To mount them, call handlePlanEditorRoute(req, res, u) inside the
 * router() function in server.ts before the static-file fallback:
 *
 *   import { handlePlanEditorRoute } from './plan-editor-routes';
 *   // ... inside router():
 *   if (await handlePlanEditorRoute(req, res, u)) return;
 *
 * Endpoints
 * ---------
 *   GET    /api/approval-queue              — list all pending plan entries
 *   GET    /api/approval-queue/:id          — get a single entry
 *   PATCH  /api/approval-queue/:id          — apply a sparse plan step edit
 *   POST   /api/approval-queue/:id/decision — approve / reject / request revision
 *
 * All responses follow { ok: boolean, data?: unknown, error?: string }.
 *
 * @author Akshat Raj <AkshatRaj00>
 */

import * as http from 'http';
import {
  listQueue,
  getEntry,
  applyPlanEdit,
  recordDecision,
  PlanEditRequest,
  ApprovalDecision,
} from '../core/plan-approval';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, PATCH, POST, OPTIONS',
  });
  res.end(payload);
};

const ok = (res: http.ServerResponse, data: unknown): void =>
  sendJson(res, 200, { ok: true, data });

const fail = (res: http.ServerResponse, status: number, message: string): void =>
  sendJson(res, status, { ok: false, error: message });

const parseBody = <T>(req: http.IncomingMessage, limit = 256 * 1024): Promise<T> =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw.trim() ? (JSON.parse(raw) as T) : ({} as T));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

const QUEUE_LIST_RE = /^\/api\/approval-queue$/;
const QUEUE_ENTRY_RE = /^\/api\/approval-queue\/([^/]+)$/;
const QUEUE_DECISION_RE = /^\/api\/approval-queue\/([^/]+)\/decision$/;

/**
 * Handle a plan-editor route.
 *
 * Returns true if the request was handled (so the caller can return early),
 * false if no route matched.
 */
export const handlePlanEditorRoute = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> => {
  const method = req.method ?? 'GET';

  // GET /api/approval-queue
  if (QUEUE_LIST_RE.test(pathname) && method === 'GET') {
    ok(res, listQueue());
    return true;
  }

  // GET /api/approval-queue/:id
  const entryMatch = QUEUE_ENTRY_RE.exec(pathname);
  if (entryMatch && method === 'GET') {
    const entry = getEntry(entryMatch[1]);
    if (!entry) {
      fail(res, 404, `No queue entry found for id: ${entryMatch[1]}`);
    } else {
      ok(res, entry);
    }
    return true;
  }

  // PATCH /api/approval-queue/:id
  if (entryMatch && method === 'PATCH') {
    try {
      const body = await parseBody<{ stepUpdates?: PlanEditRequest['stepUpdates'] }>(req);
      const editReq: PlanEditRequest = {
        entryId: entryMatch[1],
        stepUpdates: body.stepUpdates ?? [],
      };
      const result = applyPlanEdit(editReq);
      if (!result.ok) {
        const status = result.reason === 'not_found' ? 404 : 409;
        const msg =
          result.reason === 'not_found'
            ? `No queue entry found for id: ${entryMatch[1]}`
            : `Cannot edit entry ${entryMatch[1]}: entry is not in pending state.`;
        fail(res, status, msg);
      } else {
        ok(res, result.entry);
      }
    } catch (e) {
      fail(res, 400, String(e));
    }
    return true;
  }

  // POST /api/approval-queue/:id/decision
  const decisionMatch = QUEUE_DECISION_RE.exec(pathname);
  if (decisionMatch && method === 'POST') {
    try {
      const decision = await parseBody<ApprovalDecision>(req);
      if (!decision?.action) {
        fail(res, 400, 'Missing required field: action');
        return true;
      }
      const allowed: ApprovalDecision['action'][] = ['approve', 'reject', 'request_revision'];
      if (!allowed.includes(decision.action)) {
        fail(res, 400, `Invalid action. Must be one of: ${allowed.join(', ')}`);
        return true;
      }
      const result = recordDecision(decisionMatch[1], decision);
      if (!result.ok) {
        const status = result.reason === 'not_found' ? 404 : 409;
        const msg =
          result.reason === 'not_found'
            ? `No queue entry found for id: ${decisionMatch[1]}`
            : `Entry ${decisionMatch[1]} is already in a terminal state.`;
        fail(res, status, msg);
      } else {
        ok(res, result.entry);
      }
    } catch (e) {
      fail(res, 400, String(e));
    }
    return true;
  }

  return false;
};
