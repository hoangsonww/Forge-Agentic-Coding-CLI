/**
 * Web search tool that queries the web and returns a list of results. This tool can be used to retrieve information from the web when the query is known but the URLs are not. It supports multiple providers (Tavily, Brave, DuckDuckGo) depending on configured API keys. Use with caution, as it makes network requests and may be subject to rate limits, CAPTCHAs, or other anti-bot measures on certain search engines.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Tool, ToolResult } from '../types';
import { webSearch, SearchResult } from '../web/search';
import { ForgeRuntimeError } from '../types/errors';

interface Args {
  query: string;
  limit?: number;
}

export const webSearchTool: Tool<Args, { results: SearchResult[]; provider: string }> = {
  schema: {
    name: 'web.search',
    description: 'Search the web. Uses Tavily → Brave → DuckDuckGo depending on configured keys.',
    sideEffect: 'network',
    risk: 'low',
    permissionDefault: 'ask',
    sensitivity: 'low',
    timeoutMs: 20_000,
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  async execute(args): Promise<ToolResult<{ results: SearchResult[]; provider: string }>> {
    const start = Date.now();
    try {
      const results = await webSearch({ query: args.query, limit: args.limit });
      return {
        success: true,
        output: { results, provider: inferProvider() },
        durationMs: Date.now() - start,
      };
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

const inferProvider = (): string => {
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.BRAVE_SEARCH_API_KEY) return 'brave';
  return 'duckduckgo';
};
