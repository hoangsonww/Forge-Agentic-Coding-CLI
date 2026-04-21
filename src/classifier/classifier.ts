/**
 * Classifier module — responsible for analyzing the user's task description and determining the nature of the task. This includes classifying the intent (e.g., bugfix, feature, refactor), estimating complexity, assessing risk, and determining the scope of changes. The classifier uses a combination of heuristics and LLM analysis to produce a TaskProfile that guides the subsequent planning and execution steps.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { Mode, TaskProfile } from '../types';
import { heuristicClassify } from './heuristics';
import { callModel } from '../models/router';
import { log } from '../logging/logger';

export interface ClassifyParams {
  input: string;
  filesReferenced?: string[];
  mode: Mode;
  useLLM?: boolean;
}

const DEFAULT_AGENTS_BY_TYPE: Record<string, string[]> = {
  bugfix: ['debugger', 'executor', 'reviewer'],
  feature: ['planner', 'architect', 'executor', 'reviewer'],
  refactor: ['planner', 'executor', 'reviewer'],
  analysis: ['planner'],
  setup: ['executor'],
  test: ['executor', 'reviewer'],
  optimization: ['planner', 'executor', 'reviewer'],
  other: ['planner', 'executor'],
};

const llmSchemaInstruction = `You are a task classifier. Output STRICT JSON with keys:
intent (bugfix|feature|refactor|analysis|setup|test|optimization|other),
secondary (array of same enum),
complexity (trivial|simple|moderate|complex),
scope (single-file|multi-file|multi-module|system-wide),
risk (low|medium|high|critical),
requires_plan (bool),
requires_tests (bool),
explanation (string, <=160 chars).
Do not include prose. Only JSON.`;

export const classify = async (params: ClassifyParams): Promise<TaskProfile> => {
  const heuristic = heuristicClassify(params.input, params.filesReferenced?.length ?? 0);
  let enriched = heuristic;

  const forceLLM = (params.useLLM ?? heuristic.confidence < 0.55) || params.mode === 'heavy';
  if (forceLLM && params.mode !== 'offline-safe') {
    try {
      const { response } = await callModel(
        'planner',
        'fast',
        [
          { role: 'system', content: llmSchemaInstruction },
          { role: 'user', content: params.input },
        ],
        { jsonMode: true, temperature: 0, maxTokens: 400, timeoutMs: 20_000 },
      );
      const parsed = safeJson(response.content);
      if (parsed) {
        enriched = {
          type: parsed.intent ?? heuristic.type,
          secondary: parsed.secondary ?? heuristic.secondary,
          complexity: parsed.complexity ?? heuristic.complexity,
          scope: parsed.scope ?? heuristic.scope,
          risk: parsed.risk ?? heuristic.risk,
          confidence: Math.max(heuristic.confidence, 0.75),
        };
      }
    } catch (err) {
      log.debug('classifier LLM fallback failed; using heuristics only', { err: String(err) });
    }
  }

  const requiresPlan = enriched.complexity !== 'trivial' || params.mode === 'plan';
  const requiresTests =
    enriched.type === 'bugfix' || enriched.type === 'feature' || enriched.type === 'refactor';
  const requiresReview = enriched.complexity !== 'trivial';

  return {
    intent: enriched.type,
    secondary: enriched.secondary,
    complexity: enriched.complexity,
    scope: enriched.scope,
    risk: enriched.risk,
    requiresPlan,
    requiresTests,
    requiresReview,
    agents: DEFAULT_AGENTS_BY_TYPE[enriched.type] ?? DEFAULT_AGENTS_BY_TYPE.other,
    skills: [],
    explanation: `h=${heuristic.type}/${heuristic.complexity}/${heuristic.risk} (conf ${heuristic.confidence.toFixed(
      2,
    )})`,
  };
};

const safeJson = (content: string): Record<string, any> | null => {
  const trimmed = content.trim();
  // Common trick: LLMs sometimes wrap JSON in ```json ... ```
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(trimmed);
  const candidate = fence ? fence[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};
