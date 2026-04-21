import * as crypto from 'crypto';
import { AssembledPrompt, Mode, ModelMessage, PromptLayer, PromptSegment, Tool } from '../types';
import { systemCore, modeLayer, toolCatalog, taskHeader } from './layers';
import { fenceUntrusted } from '../security/injection';
import { redactString } from '../security/redact';

/**
 * Assembler: constructs a model prompt from various input layers, enforcing a token budget and producing a manifest for logging and caching. The output is a structured
 * prompt ready for model consumption, along with metadata for traceability.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const PROMPT_VERSION = '1.0';

const LAYER_PRIORITY: Record<PromptLayer, number> = {
  system_core: 0,
  mode: 1,
  task_instructions: 2,
  project_instructions: 3,
  context: 4,
  tools: 5,
  global_instructions: 6,
  user_input: 7,
};

export interface AssembleOptions {
  mode: Mode;
  userInput: string;
  globalInstructions?: string | null;
  projectInstructions?: string | null;
  taskInstructions?: string;
  contextBlocks?: Array<{ source: string; content: string }>;
  tools?: Tool[];
  tokenBudget?: number; // chars-ish; we truncate lowest priority first
}

const approxTokens = (s: string): number => Math.ceil(s.length / 4);

export const assemblePrompt = (opts: AssembleOptions): AssembledPrompt => {
  const segs: PromptSegment[] = [];

  const push = (layer: PromptLayer, content: string, priority: number): void => {
    if (!content || !content.trim()) return;
    segs.push({ layer, content, priority, tokens: approxTokens(content) });
  };

  push('system_core', systemCore(), LAYER_PRIORITY.system_core);
  push('mode', modeLayer(opts.mode), LAYER_PRIORITY.mode);
  if (opts.globalInstructions) {
    push(
      'global_instructions',
      `[global instructions]\n${opts.globalInstructions}`,
      LAYER_PRIORITY.global_instructions,
    );
  }
  if (opts.projectInstructions) {
    push(
      'project_instructions',
      `[project instructions]\n${opts.projectInstructions}`,
      LAYER_PRIORITY.project_instructions,
    );
  }
  if (opts.taskInstructions) {
    push('task_instructions', opts.taskInstructions, LAYER_PRIORITY.task_instructions);
  }
  if (opts.contextBlocks?.length) {
    const ctx = opts.contextBlocks.map((b) => fenceUntrusted(b.source, b.content)).join('\n\n');
    push('context', ctx, LAYER_PRIORITY.context);
  }
  if (opts.tools?.length) {
    push('tools', toolCatalog(opts.tools), LAYER_PRIORITY.tools);
  }
  push('user_input', redactString(opts.userInput), LAYER_PRIORITY.user_input);

  // Token budget enforcement — truncate lowest priority first. system/mode/task
  // never get truncated.
  let budget = opts.tokenBudget ?? 16_000;
  const byPriorityDesc = [...segs].sort((a, b) => b.priority - a.priority);
  const totalTokens = segs.reduce((acc, s) => acc + (s.tokens ?? 0), 0);
  if (totalTokens > budget) {
    for (const seg of byPriorityDesc) {
      if (seg.layer === 'system_core' || seg.layer === 'mode' || seg.layer === 'task_instructions')
        continue;
      const over = segs.reduce((acc, s) => acc + (s.tokens ?? 0), 0) - budget;
      if (over <= 0) break;
      const cut = Math.min(seg.content.length, over * 4);
      seg.content = seg.content.slice(0, seg.content.length - cut) + '\n…[truncated by assembler]';
      seg.tokens = approxTokens(seg.content);
    }
  }
  budget = Math.max(budget, 0);

  // Build model messages. We fold every layer except user_input into a single
  // system block to preserve the system/data boundary.
  const systemBlocks: string[] = [];
  let userBlock = '';
  for (const seg of segs.sort((a, b) => a.priority - b.priority)) {
    if (seg.layer === 'user_input') userBlock = seg.content;
    else systemBlocks.push(seg.content);
  }
  const messages: ModelMessage[] = [
    { role: 'system', content: systemBlocks.join('\n\n---\n\n') },
    { role: 'user', content: userBlock },
  ];

  const manifest = segs.map((s) => ({ ...s, content: '(redacted in manifest)' }));
  const hash = crypto
    .createHash('sha256')
    .update(systemBlocks.join('\n\n') + '\n\n' + userBlock)
    .digest('hex')
    .slice(0, 16);

  return {
    messages,
    manifest: manifest as PromptSegment[],
    hash,
    mode: opts.mode,
    version: PROMPT_VERSION,
  };
};

export const assembleTaskPrompt = (params: {
  mode: Mode;
  title: string;
  description?: string;
  globalInstructions?: string | null;
  projectInstructions?: string | null;
  contextBlocks?: Array<{ source: string; content: string }>;
  tools?: Tool[];
  additionalUserText?: string;
}): AssembledPrompt =>
  assemblePrompt({
    mode: params.mode,
    userInput: params.additionalUserText ?? taskHeader(params.title, params.description),
    taskInstructions: taskHeader(params.title, params.description),
    globalInstructions: params.globalInstructions,
    projectInstructions: params.projectInstructions,
    contextBlocks: params.contextBlocks,
    tools: params.tools,
  });
