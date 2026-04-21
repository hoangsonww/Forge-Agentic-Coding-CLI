import { Tool, ToolResult } from '../types';
import { runBrowseSteps, BrowseStep, BrowseOutput } from '../web/browse';
import { ForgeRuntimeError } from '../types/errors';

/**
 * Web browsing tool that executes a sequence of browser actions using Playwright. This tool can perform various actions such as navigating to URLs, clicking elements, typing into fields, pressing keys, waiting for elements, and extracting information from the page. The input is an array of steps that define the actions to be performed in order. Use with caution, as this tool can interact with any website and may have side effects (e.g., submitting forms, making purchases) depending on the actions specified.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

interface Args {
  steps: BrowseStep[];
  headless?: boolean;
  timeoutMs?: number;
}

export const webBrowseTool: Tool<Args, BrowseOutput> = {
  schema: {
    name: 'web.browse',
    description:
      'Run a sequence of browser actions (goto/click/type/press/waitFor/extract) via Playwright.',
    sideEffect: 'network',
    risk: 'high',
    permissionDefault: 'ask',
    sensitivity: 'high',
    timeoutMs: 120_000,
    inputSchema: {
      type: 'object',
      required: ['steps'],
      properties: {
        steps: { type: 'array' },
        headless: { type: 'boolean' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  async execute(args): Promise<ToolResult<BrowseOutput>> {
    const start = Date.now();
    try {
      const out = await runBrowseSteps(args.steps, {
        headless: args.headless,
        timeoutMs: args.timeoutMs,
      });
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
