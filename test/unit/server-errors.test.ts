/**
 * Tests for the shared errorBody helper in src/ui/server.ts. Rather than
 * spin up the whole HTTP server in unit tests, we test the helper in
 * isolation via a re-export. This verifies: the 'Error:' prefix is stripped,
 * status-code annotations on Errors are honoured, and "not found" messages
 * map to 404.
 */
import { describe, it, expect } from 'vitest';
import { errorBody } from '../../src/ui/server-errors';

describe('errorBody', () => {
  it('strips leading "Error:" from Error instances', () => {
    const out = errorBody(new Error('something went wrong'));
    expect(out.body.error).toBe('something went wrong');
    expect(out.status).toBe(400);
  });

  it('maps "not found" messages to 404', () => {
    const out = errorBody(new Error('chat session chat-x not found'));
    expect(out.status).toBe(404);
    expect(out.body.error).toBe('chat session chat-x not found');
  });

  it('honours an explicit .statusCode on the Error', () => {
    const err = Object.assign(new Error('nope'), { statusCode: 403 });
    expect(errorBody(err).status).toBe(403);
  });

  it('falls back to a generic 400 for strings and unknowns', () => {
    expect(errorBody('plain string').status).toBe(400);
    expect(errorBody({ weird: true }).status).toBe(400);
  });

  it('returns the full message for plain strings', () => {
    expect(errorBody('totally invalid').body.error).toBe('totally invalid');
  });
});
