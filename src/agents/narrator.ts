/**
 * Narrator agent — produces the user-facing prose answer for analysis /
 * informational tasks (summarize, explain, describe, audit).
 *
 * Why this exists:
 *   The executor runs with `jsonMode: true` because every turn must return a
 *   parseable `{actions, summary, done}` object. That JSON contract forces
 *   the `summary` field to describe what the agent did this turn
 *   ("File has been read successfully"), not the *content* the user asked
 *   for. For code-change tasks that's fine — the deliverable is the diff. For
 *   informational tasks the diff is empty and the step summaries read as
 *   nonsense to the user.
 *
 *   The narrator is a single non-JSON call run after the executor completes.
 *   It takes the tool outputs the executor gathered (file contents, grep
 *   hits, etc.) and asks a capable general-purpose model to actually answer
 *   the user's original question. Because it doesn't set `jsonMode`, the
 *   streaming path in the router kicks in and the user watches the answer
 *   render live via the progress rail.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Mode, ToolResult } from '../types';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { log } from '../logging/logger';

export interface NarratorToolResult {
  tool: string;
  args: unknown;
  result: ToolResult<unknown>;
}

export interface NarrateParams {
  taskTitle: string;
  taskDescription: string;
  toolResults: NarratorToolResult[];
  mode: Mode;
  taskId?: string;
  projectId?: string;
}

/** Per-tool-result size cap so a giant file doesn't blow the context window. */
const PER_RESULT_MAX = 18_000;
/** Aggregate cap across all results. */
const TOTAL_CONTEXT_MAX = 60_000;

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max) + `\n…[truncated ${s.length - max} chars]` : s;

/**
 * Best-effort extraction of "human-readable content" from a tool result.
 * Tools that produce file contents or search hits are the common case; for
 * everything else we fall back to a JSON dump so the model still has signal.
 */
const extractContent = (tr: NarratorToolResult): string => {
  if (!tr.result.success) {
    const msg = tr.result.error?.message ?? 'tool failed';
    return `[error] ${msg}`;
  }
  const out = tr.result.output as unknown;
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (typeof out === 'object') {
    const rec = out as Record<string, unknown>;
    // Canonical content-bearing shapes used across Forge's tools.
    if (typeof rec.content === 'string') return String(rec.content);
    if (Array.isArray(rec.matches)) {
      return rec.matches.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n');
    }
    if (typeof rec.text === 'string') return String(rec.text);
    if (typeof rec.body === 'string') return String(rec.body);
    try {
      return JSON.stringify(out, null, 2);
    } catch {
      return String(out);
    }
  }
  return String(out);
};

const toolLabel = (tr: NarratorToolResult): string => {
  const args = tr.args as Record<string, unknown> | undefined;
  const target = (args && (args.path || args.file || args.pattern || args.url || args.query)) ?? '';
  return target ? `${tr.tool} · ${String(target).slice(0, 120)}` : tr.tool;
};

/**
 * Ask the model to write the user-facing answer. Streams by virtue of not
 * setting jsonMode; the router emits deltas via the event bus which the
 * progress rail renders live.
 */
export const narrateAnalysis = async (params: NarrateParams): Promise<string> => {
  const blocks: string[] = [];
  let total = 0;
  for (const tr of params.toolResults) {
    const content = extractContent(tr);
    if (!content) continue;
    const capped = truncate(content, PER_RESULT_MAX);
    const fenced = `### ${toolLabel(tr)}\n\n${capped}`;
    if (total + fenced.length > TOTAL_CONTEXT_MAX) break;
    blocks.push(fenced);
    total += fenced.length;
  }
  const context = blocks.join('\n\n---\n\n') || '(no tool output was gathered)';

  const prompt = assembleTaskPrompt({
    mode: params.mode,
    title: params.taskTitle,
    description: params.taskDescription,
    additionalUserText: `You are answering an informational / analysis task. The executor has already gathered the relevant context below via tools. Your job now is to write the answer the user asked for — directly, concretely, in well-formatted Markdown.

Rules:
- Write the answer. Do NOT narrate what you're about to do.
- Do NOT wrap the answer in JSON or code fences (unless you're quoting code).
- Prefer short paragraphs, bullet points for lists of things, and inline \`code\` for identifiers.
- If the task is to summarize, produce a summary — don't just say "the file was read".

USER TASK:
${params.taskDescription || params.taskTitle}

GATHERED CONTEXT:
${context}

Now write the answer.`,
  });

  try {
    // No jsonMode → router will invoke stream() on the provider and emit
    // per-token deltas over the event bus. CLI/REPL/UI already render those
    // live. The accumulated text is returned as `response.content`.
    const { response } = await callModel(
      'planner',
      params.mode,
      prompt.messages,
      {
        temperature: 0.3,
        maxTokens: 2_000,
        timeoutMs: 180_000,
      },
      { taskId: params.taskId, projectId: params.projectId, role: 'planner' },
    );
    return response.content.trim();
  } catch (err) {
    log.warn('narrator failed', { err: String(err) });
    // Fall back to a minimal note so the caller still has something usable;
    // loop.ts keeps the step summaries as backup content.
    return '';
  }
};

export interface ConversationParams {
  input: string;
  mode: Mode;
  taskId?: string;
  projectId?: string;
  /**
   * Composed prior-turns context (from composeDescription in the REPL path).
   * Pre-formatted as markdown with `## Current request` / `## Conversation
   * so far` sections. Passed verbatim to the model so follow-ups like
   * "what have we talked about?" can actually recall.
   */
  description?: string;
}

/**
 * Answer a pure conversational question with no tool access. Used by the
 * orchestrator's conversation fast-path — same streaming contract as
 * `narrateAnalysis` (no jsonMode → router emits deltas → progress rail
 * renders live) but without a GATHERED CONTEXT block, since the whole
 * point is that no tools need to run.
 *
 * Multi-turn history: when `description` is supplied (REPL / UI wrap the
 * new user message with prior turns via composeDescription), we hand the
 * whole thing to the model under an explicit "CONVERSATION HISTORY" block
 * so follow-up questions ("what have we talked about?") resolve against
 * the actual prior turns instead of the model hallucinating.
 */
export const respondConversation = async (params: ConversationParams): Promise<string> => {
  // If we got a composed description (multi-turn context), use it as the
  // primary payload. Otherwise the raw input is enough.
  const desc = params.description;
  const hasHistory =
    typeof desc === 'string' &&
    desc.length > params.input.length &&
    desc.includes('Conversation so far');
  const payload = hasHistory && desc ? desc : params.input;

  const prompt = assembleTaskPrompt({
    mode: params.mode,
    title: 'Conversation',
    description: params.input,
    additionalUserText: `You are a helpful software-engineering assistant answering a general conversational question. The user is NOT asking about a specific codebase — answer from general knowledge.

Rules:
- Answer directly. Do NOT narrate what you're about to do.
- Do NOT wrap the answer in JSON.
- Use concise Markdown: short paragraphs, inline \`code\` for identifiers, fenced \`\`\` blocks only for code samples.
- If the question is ambiguous, pick the most common interpretation and answer.
${hasHistory ? '- Use the CONVERSATION HISTORY below as ground truth when answering follow-ups. If the user asks "what have we talked about?" or similar, summarize ONLY the actual prior turns listed — do NOT invent topics that were not discussed.' : ''}

${hasHistory ? 'CONVERSATION HISTORY & CURRENT REQUEST:\n' : 'QUESTION:\n'}${payload}

Now write the answer.`,
  });

  try {
    const { response } = await callModel(
      'planner',
      params.mode,
      prompt.messages,
      {
        temperature: 0.4,
        maxTokens: 1_500,
        timeoutMs: 120_000,
      },
      { taskId: params.taskId, projectId: params.projectId, role: 'planner' },
    );
    return response.content.trim();
  } catch (err) {
    log.warn('conversation responder failed', { err: String(err) });
    throw err;
  }
};
