import { Agent, AgentResult } from './base';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { loadGlobalInstructions, loadProjectInstructions } from '../config/loader';
import { retrieve } from '../memory/retrieval';
import { log } from '../logging/logger';

/**
 * Architect agent — produces a system-level design document (not a plan).
 * Use this explicitly via `--mode architect` when the task is "how should we
 * structure X". No file edits; the output is prose/diagram text the user
 * can decide to feed back in as an approved plan seed.
 */

const architectSchema = `You are an Architect. You do NOT modify files — you only produce a design document.

Output STRICT JSON:
{
  "goal": string,
  "approach": string,            // 1–3 paragraphs
  "components": [
    { "name": string, "responsibility": string, "interactions": string[] }
  ],
  "tradeoffs": [
    { "option": string, "pros": string[], "cons": string[] }
  ],
  "recommendation": string,
  "risks": string[],
  "openQuestions": string[]
}`;

export interface ArchitectureOutput {
  goal: string;
  approach: string;
  components: Array<{ name: string; responsibility: string; interactions: string[] }>;
  tradeoffs: Array<{ option: string; pros: string[]; cons: string[] }>;
  recommendation: string;
  risks: string[];
  openQuestions: string[];
}

const parse = (content: string): ArchitectureOutput | null => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  try {
    return JSON.parse(fence ? fence[1] : content) as ArchitectureOutput;
  } catch {
    return null;
  }
};

export const architectAgent: Agent = {
  name: 'architect',
  description: 'Produces system-level design documents. No file edits.',
  async run(ctx): Promise<AgentResult> {
    const retrieved = retrieve({
      projectRoot: ctx.projectRoot,
      query: `${ctx.task.title}\n${ctx.task.description ?? ''}`,
      maxColdHits: 12,
      maxWarmFiles: 10,
    });
    const prompt = assembleTaskPrompt({
      mode: ctx.mode,
      title: `Architect: ${ctx.task.title}`,
      description: ctx.task.description,
      globalInstructions: loadGlobalInstructions(),
      projectInstructions: loadProjectInstructions(ctx.projectRoot),
      contextBlocks: retrieved.blocks,
      additionalUserText: `${architectSchema}\n\nREQUEST:\n${ctx.task.title}\n${ctx.task.description ?? ''}`,
    });
    try {
      const { response } = await callModel('architect', ctx.mode, prompt.messages, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 3000,
        timeoutMs: 90_000,
      });
      const parsed = parse(response.content);
      return { success: Boolean(parsed), output: parsed ?? { raw: response.content }, prompt };
    } catch (err) {
      log.warn('architect failed', { err: String(err) });
      return { success: false, message: String(err) };
    }
  },
};
