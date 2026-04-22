/**
 * Planner agent — converts user intent into a structured plan of action steps. This is the first step in the pipeline after receiving a task. The output is a Plan object that includes a goal and a list of steps, which can be of various types (e.g., analyze, edit_file, run_tests). The planner should produce a minimal plan that prioritizes reading and verification before writing, and it should reference concrete file paths when possible. If the planner fails to produce a valid plan, a fallback plan with generic steps will be used instead.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Plan, PlanStep, Task, Mode } from '../types';
import { Agent, AgentResult } from './base';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { newPlanId, newStepId } from '../logging/trace';
import { log } from '../logging/logger';
import { allTools } from '../tools/registry';
import { ForgeRuntimeError } from '../types/errors';
import { loadGlobalInstructions, loadProjectInstructions } from '../config/loader';
import { retrieve } from '../memory/retrieval';
import { relevantPatterns } from '../memory/learning';

const planSchemaPrompt = `Produce a PLAN as strict JSON with the shape:

{
  "goal": string,
  "steps": [
    {
      "id": string,                    // short, unique, e.g. "step_001"
      "type": "analyze" | "plan" | "edit_file" | "apply_patch" | "create_file" | "delete_file" |
              "run_command" | "run_tests" | "review" | "debug" | "retrieve_context" |
              "ask_user" | "custom",
      "description": string,           // one line, actionable
      "target"?: string,               // e.g. file path, branch name
      "args"?: object,                 // tool-specific args (paths, commands, etc.)
      "dependsOn"?: string[],          // step ids (default: previous step)
      "risk"?: "low" | "medium" | "high" | "critical",
      "tool"?: string                  // tool name, when type is a tool-execution step
    }
  ]
}

Rules:
- Output JSON only. No prose.
- Keep the plan minimal — no busywork steps.
- Prefer reading before writing. Always include verification (tests or review) before completion.
- If user approval may be needed for a destructive step, mark risk accordingly.
- Reference concrete file paths where known. If unknown, include a retrieve_context step first.
- When creating a new file with content, emit ONE step of type create_file with the full body (do not split into "create empty" + "edit to fill" — edit_file cannot target an empty file).
- Prefer edit_file for surgical modifications of existing content (pass a unique oldText snippet); use write_file only when rewriting the entire body.`;

const buildFallbackPlan = (task: Task): Plan => {
  const steps: PlanStep[] = [
    {
      id: newStepId(1),
      type: 'analyze',
      description: `Survey repository and locate files relevant to: ${task.title}`,
    },
    {
      id: newStepId(2),
      type: 'edit_file',
      description: `Apply the requested change for: ${task.title}`,
      dependsOn: [newStepId(1)],
    },
    {
      id: newStepId(3),
      type: 'run_tests',
      description: 'Run test suite to validate change.',
      dependsOn: [newStepId(2)],
      risk: 'medium',
    },
    {
      id: newStepId(4),
      type: 'review',
      description: 'Review outcome and summarize.',
      dependsOn: [newStepId(3)],
    },
  ];
  return {
    id: newPlanId(),
    goal: task.title,
    steps,
    createdAt: new Date().toISOString(),
    mode: task.mode,
    version: '1',
  };
};

const parseSafely = (content: string): Record<string, unknown> | null => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  try {
    return JSON.parse(fence ? fence[1] : content) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const coerceSteps = (raw: unknown): PlanStep[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any, idx) => {
    const id = typeof s?.id === 'string' && s.id.length ? s.id : newStepId(idx + 1);
    const type = typeof s?.type === 'string' ? (s.type as PlanStep['type']) : 'custom';
    return {
      id,
      type,
      description: String(s?.description ?? `Step ${idx + 1}`),
      target: typeof s?.target === 'string' ? s.target : undefined,
      args: s?.args && typeof s.args === 'object' ? s.args : undefined,
      dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map(String) : undefined,
      risk: ['low', 'medium', 'high', 'critical'].includes(s?.risk) ? s.risk : undefined,
      tool: typeof s?.tool === 'string' ? s.tool : undefined,
    };
  });
};

/**
 * Pull patterns that the learning layer has accumulated for this task's
 * intent:scope. Only surfaces rows confident enough to be actionable so we
 * don't bias the planner with weak or stale signals.
 */
const learnedPatternBlock = (task: Task): { source: string; content: string } | null => {
  const profile = task.profile;
  if (!profile) return null;
  const key = `${profile.intent}:${profile.scope}`;
  const rows = relevantPatterns(key, 5).filter((p) => p.confidence >= 0.55);
  if (!rows.length) return null;
  const lines = rows.map((p) => {
    const hint = p.fix.trim().slice(0, 200);
    const tag = p.confidence >= 0.8 ? 'strong' : 'moderate';
    return `- (${tag} ${p.confidence.toFixed(2)}) ${p.pattern.slice(0, 120)} → ${hint}`;
  });
  return {
    source: 'learned_patterns',
    content:
      `The following patterns have been observed on prior ${key} tasks. Prefer ` +
      `fixes that align with strong patterns; avoid repeating moves that have ` +
      `failed before.\n\n${lines.join('\n')}`,
  };
};

export const buildPlannerPrompt = (task: Task, projectRoot: string, mode: Mode) => {
  const retrieved = retrieve({
    projectRoot,
    query: `${task.title}\n${task.description ?? ''}`,
    maxColdHits: mode === 'heavy' ? 12 : 6,
  });
  const patternBlock = learnedPatternBlock(task);
  const contextBlocks = patternBlock ? [...retrieved.blocks, patternBlock] : retrieved.blocks;
  return assembleTaskPrompt({
    mode,
    title: task.title,
    description: task.description,
    globalInstructions: loadGlobalInstructions(),
    projectInstructions: loadProjectInstructions(projectRoot),
    contextBlocks,
    tools: allTools(),
    additionalUserText: `${planSchemaPrompt}\n\nTASK:\n${task.title}\n${task.description ?? ''}`,
  });
};

export const plannerAgent: Agent = {
  name: 'planner',
  description: 'Converts intent into a structured task plan (DAG).',
  async run(ctx): Promise<AgentResult> {
    const prompt = buildPlannerPrompt(ctx.task, ctx.projectRoot, ctx.mode);
    try {
      const { response } = await callModel('planner', ctx.mode, prompt.messages, {
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 2000,
        timeoutMs: 60_000,
      });
      const parsed = parseSafely(response.content);
      if (!parsed || !Array.isArray((parsed as any).steps)) {
        log.warn('planner: malformed JSON, using fallback plan');
        const plan = buildFallbackPlan(ctx.task);
        return { success: true, output: plan, prompt };
      }
      const plan: Plan = {
        id: newPlanId(),
        goal: String((parsed as any).goal ?? ctx.task.title),
        steps: coerceSteps((parsed as any).steps),
        createdAt: new Date().toISOString(),
        mode: ctx.mode,
        version: '1',
      };
      return { success: true, output: plan, prompt };
    } catch (err) {
      log.warn('planner failed; using fallback plan', { err: String(err) });
      if (err instanceof ForgeRuntimeError && err.class === 'model_error') {
        const plan = buildFallbackPlan(ctx.task);
        return { success: true, output: plan, prompt };
      }
      throw err;
    }
  },
};
