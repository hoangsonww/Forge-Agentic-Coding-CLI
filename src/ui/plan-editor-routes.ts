/**
 * REST handlers for the Interactive Plan Editor — Issue #8.
 *
 * Plugs into the existing raw-http router in src/ui/server.ts via
 * handlePlanEditorRoute(). Call it from the router function before the
 * static-file fallback:
 *
 *   if (handlePlanEditorRoute(req, res, p)) return;
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

import * as http from 'http';
import { listQueue, getEntry, applyPlanEdit, recordDecision } from '../core/plan-approval';
import type { PlanEditRequest, ApprovalDecision, PlanApprovalAction } from '../core/plan-approval';

const ALLOWED_ACTIONS: ReadonlySet<PlanApprovalAction> = new Set([
  'approve',
  'reject',
  'request_revision',
]);

const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const parseBody = async <T>(req: http.IncomingMessage): Promise<T> => {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
};

/**
 * Handle plan-editor API routes. Returns true if the request was handled.
 * Drop this into the server.ts router before the static-file fallback.
 */
export const handlePlanEditorRoute = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean => {
  // GET /api/approval-queue
  if (pathname === '/api/approval-queue' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, data: listQueue() });
    return true;
  }

  // GET /api/approval-queue/:id
  const idMatch = /^\/api\/approval-queue\/([^/]+)$/.exec(pathname);
  if (idMatch && req.method === 'GET') {
    const entry = getEntry(idMatch[1]);
    if (!entry) {
      sendJson(res, 404, { ok: false, error: `No queue entry found for id: ${idMatch[1]}` });
    } else {
      sendJson(res, 200, { ok: true, data: entry });
    }
    return true;
  }

  // PATCH /api/approval-queue/:id
  if (idMatch && req.method === 'PATCH') {
    void (async () => {
      const body = await parseBody<Partial<PlanEditRequest>>(req);
      const editReq: PlanEditRequest = {
        entryId: idMatch[1],
        stepUpdates: body.stepUpdates ?? [],
      };
      const updated = applyPlanEdit(editReq);
      if (!updated) {
        sendJson(res, 409, {
          ok: false,
          error: `Cannot edit entry ${idMatch[1]}: not found or not in pending state.`,
        });
      } else {
        sendJson(res, 200, { ok: true, data: updated });
      }
    })();
    return true;
  }

  // POST /api/approval-queue/:id/decision
  const decisionMatch = /^\/api\/approval-queue\/([^/]+)\/decision$/.exec(pathname);
  if (decisionMatch && req.method === 'POST') {
    void (async () => {
      const body = await parseBody<Partial<ApprovalDecision>>(req);
      if (!body.action) {
        sendJson(res, 400, { ok: false, error: 'Missing required field: action' });
        return;
      }
      if (!ALLOWED_ACTIONS.has(body.action)) {
        sendJson(res, 400, {
          ok: false,
          error: `Invalid action. Must be one of: ${[...ALLOWED_ACTIONS].join(', ')}`,
        });
        return;
      }
      const updated = recordDecision(decisionMatch[1], body as ApprovalDecision);
      if (!updated) {
        sendJson(res, 404, {
          ok: false,
          error: `No queue entry found for id: ${decisionMatch[1]}`,
        });
      } else {
        sendJson(res, 200, { ok: true, data: updated });
      }
    })();
    return true;
  }

  return false;
};
