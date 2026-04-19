import { Tool, ToolResult } from '../types';
import { webFetch, FetchResult } from '../web/fetch';
import { ForgeRuntimeError } from '../types/errors';

interface Args {
  url: string;
  maxBytes?: number;
  maxChars?: number;
  timeoutMs?: number;
}

export const webFetchTool: Tool<Args, FetchResult> = {
  schema: {
    name: 'web.fetch',
    description: 'Download a webpage and return cleaned text + title.',
    sideEffect: 'network',
    risk: 'medium',
    permissionDefault: 'ask',
    sensitivity: 'medium',
    timeoutMs: 20_000,
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        maxBytes: { type: 'number' },
        maxChars: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  async execute(args): Promise<ToolResult<FetchResult>> {
    const start = Date.now();
    try {
      const out = await webFetch(args);
      return { success: true, output: out, durationMs: Date.now() - start };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof ForgeRuntimeError
            ? err.toJSON()
            : { class: 'tool_error', message: String(err), retryable: true },
        durationMs: Date.now() - start,
      };
    }
  },
};
