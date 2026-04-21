/**
 * HTTP error normalization for the UI server.
 *
 * Kept in its own tiny module so unit tests can exercise the mapping rules
 * without pulling in the entire server (which requires better-sqlite3,
 * WebSocket bindings, etc.).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface HttpError {
  status: number;
  body: { error: string };
}

/**
 * Extract a user-facing message from any thrown value and choose the right
 * HTTP status code.
 *
 *  - Error instances: message stripped of the leading "Error:" prefix.
 *  - If the Error carries a numeric `statusCode`, use it.
 *  - If the message ends with "not found" (case-insensitive), map to 404.
 *  - Otherwise default to 400 (client-caused).
 */
export const errorBody = (e: unknown): HttpError => {
  const msg = e instanceof Error ? e.message : String(e);
  const clean = msg.replace(/^Error:\s*/, '');
  const status =
    typeof (e as { statusCode?: unknown }).statusCode === 'number'
      ? (e as { statusCode: number }).statusCode
      : /not found$/i.test(clean)
        ? 404
        : 400;
  return { status, body: { error: clean } };
};
