/**
 * Forge as an MCP server. Exposes the runtime as MCP tools so other
 * agents (Claude Desktop, Cursor, Continue, etc.) can plan and run
 * Forge tasks through their own chat surfaces.
 *
 * Two trust tiers:
 *   - read-only (default): forge_status, forge_plan, forge_get_task,
 *     forge_list_tasks. Never writes a file.
 *   - execute (opt-in via FORGE_MCP_ALLOW_EXECUTE=true or --allow-execute):
 *     adds forge_run and forge_cancel_task. These can edit the project.
 *
 * Tools are exposed as `forge_*` namespaced functions because the MCP
 * client typically flattens every connected server's tools into one list.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';

import { orchestrateRun } from '../core/orchestrator';
import { loadGlobalConfig } from '../config/loader';
import { listTasks, getTask, listProjects, type TaskIndexRow } from '../persistence/index-db';
import { loadTask } from '../persistence/tasks';
import { transitionTask } from '../persistence/tasks';
import { listProviders } from '../models/provider';
import { findProjectRoot } from '../config/loader';
import { log } from '../logging/logger';
import { Mode } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const PKG_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'))
      .version as string;
  } catch {
    return 'unknown';
  }
})();

export interface McpServerOptions {
  /** Enable execution tools (forge_run, forge_cancel_task). */
  allowExecute?: boolean;
  /** Default cwd if a tool call doesn't specify one. */
  defaultCwd?: string;
}

export const createForgeMcpServer = (opts: McpServerOptions = {}): McpServer => {
  const allowExecute = opts.allowExecute ?? process.env.FORGE_MCP_ALLOW_EXECUTE === 'true';
  const defaultCwd = opts.defaultCwd ?? process.cwd();

  const server = new McpServer({
    name: 'forge',
    version: PKG_VERSION,
  });

  const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
  const json = (v: unknown) => text(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  const err = (msg: string) => ({
    isError: true,
    content: [{ type: 'text' as const, text: `forge: ${msg}` }],
  });

  // ---------------- Read-only tools (always enabled) ----------------

  server.registerTool(
    'forge_status',
    {
      description:
        'Get the Forge runtime status: version, default provider, default mode, available providers, and current working directory. No side effects.',
      inputSchema: {},
    },
    async () => {
      const cfg = loadGlobalConfig();
      const providers = await Promise.all(
        listProviders().map(async (p) => ({
          name: p.name,
          available: await p.isAvailable().catch(() => false),
        })),
      );
      return json({
        version: PKG_VERSION,
        provider: cfg.provider,
        defaultMode: cfg.defaultMode,
        cwd: defaultCwd,
        providers,
        allowExecute,
      });
    },
  );

  server.registerTool(
    'forge_plan',
    {
      description:
        'Generate a plan for a task without executing it. Read-only — no files are modified. Returns the plan JSON (steps, dependencies, risk classification).',
      inputSchema: {
        task: z.string().min(1).describe('Plain-language description of what Forge should plan.'),
        cwd: z.string().optional().describe('Working directory. Defaults to the server cwd.'),
      },
    },
    async ({ task, cwd }) => {
      try {
        const result = await orchestrateRun({
          input: task,
          mode: 'plan' as Mode,
          planOnly: true,
          autoApprove: true,
          cwd: cwd ?? defaultCwd,
        });
        return json({
          taskId: result.task.id,
          plan: result.task.plan ?? null,
          summary: result.result?.summary ?? '',
          status: result.task.status,
        });
      } catch (e) {
        log.warn('forge_plan failed', { err: String(e) });
        return err(`plan failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'forge_get_task',
    {
      description:
        'Look up a task by ID. Resolves the project automatically via the global index. Returns full task JSON: prompt, plan, status, result, files changed.',
      inputSchema: {
        taskId: z.string().min(1).describe('The task ID, e.g. task_22ce1f014275.'),
      },
    },
    async ({ taskId }) => {
      const indexed = getTask(taskId);
      if (!indexed) return err(`task not found: ${taskId}`);
      const proj = listProjects().find((p) => p.id === indexed.project_id);
      const candidates = [proj?.path, findProjectRoot(defaultCwd) ?? null, defaultCwd].filter(
        (x): x is string => Boolean(x),
      );
      for (const root of candidates) {
        const t = loadTask(root, taskId);
        if (t) return json(t);
      }
      return err(`task index entry exists but file not found in ${candidates.join(', ')}`);
    },
  );

  server.registerTool(
    'forge_list_tasks',
    {
      description:
        'List recent tasks across all projects, newest first. Optional filter by status (running, completed, failed, …) and project id.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().default(20),
        status: z.string().optional(),
        projectId: z.string().optional(),
      },
    },
    async ({ limit, status, projectId }) => {
      let rows: TaskIndexRow[] = listTasks(projectId, limit ?? 20);
      if (status) rows = rows.filter((r) => r.status === status);
      return json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          mode: r.mode,
          updated_at: r.updated_at,
          attempts: r.attempts,
          project_id: r.project_id,
        })),
      );
    },
  );

  // ---------------- Execute tools (opt-in) ----------------

  if (allowExecute) {
    server.registerTool(
      'forge_run',
      {
        description:
          'Run a task end-to-end: classify → plan → execute → verify. Will modify files. Permission prompts are auto-approved because MCP cannot show interactive UI.',
        inputSchema: {
          task: z.string().min(1).describe('Plain-language task description.'),
          cwd: z.string().optional(),
          mode: z
            .enum(['balanced', 'risky'])
            .optional()
            .describe('Execution mode. Defaults to balanced.'),
        },
      },
      async ({ task, cwd, mode }) => {
        try {
          const result = await orchestrateRun({
            input: task,
            mode: (mode ?? 'balanced') as Mode,
            autoApprove: true,
            cwd: cwd ?? defaultCwd,
            flags: {
              skipRoutine: true,
              allowFiles: true,
              allowShell: true,
              nonInteractive: true,
            },
          });
          return json({
            taskId: result.task.id,
            status: result.task.status,
            success: result.result?.success !== false,
            summary: result.result?.summary ?? '',
            filesChanged: result.result?.filesChanged ?? [],
            durationMs: result.result?.durationMs ?? 0,
            costUsd: result.result?.costUsd ?? 0,
          });
        } catch (e) {
          log.warn('forge_run failed', { err: String(e) });
          return err(`run failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    );

    server.registerTool(
      'forge_cancel_task',
      {
        description:
          'Cancel a running or pending task. Idempotent — already-terminal tasks are returned as-is.',
        inputSchema: {
          taskId: z.string().min(1),
        },
      },
      async ({ taskId }) => {
        const indexed = getTask(taskId);
        if (!indexed) return err(`task not found: ${taskId}`);
        const proj = listProjects().find((p) => p.id === indexed.project_id);
        if (!proj) return err(`project not found for task ${taskId}`);
        // Already-terminal tasks return their current state — idempotent.
        if (
          indexed.status === 'completed' ||
          indexed.status === 'cancelled' ||
          indexed.status === 'failed'
        ) {
          return json({ taskId, status: indexed.status, alreadyTerminal: true });
        }
        try {
          const updated = transitionTask(proj.path, taskId, 'cancelled');
          return json({ taskId, status: updated.status });
        } catch (e) {
          return err(`cancel failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    );
  }

  return server;
};

/**
 * Bootstraps the MCP server on stdio. Returns a promise that resolves
 * when the transport is closed by the peer.
 */
export const runForgeMcpServerOnStdio = async (opts: McpServerOptions = {}): Promise<void> => {
  const server = createForgeMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive until the transport closes.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
};
