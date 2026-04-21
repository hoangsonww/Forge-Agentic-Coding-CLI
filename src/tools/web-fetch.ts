/**
 * Web fetching tool that downloads a webpage and returns cleaned text and title. This tool is useful for retrieving information from the web when the URL is known. It can be used to extract content for summarization, question answering, or as part of a larger workflow that involves web data. Use with caution, as it makes network requests and may be subject to rate limits, CAPTCHAs, or other anti-bot measures on certain websites.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
