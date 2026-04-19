import { Agent, AgentResult } from './base';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { log } from '../logging/logger';
import { upsertLearning } from '../persistence/index-db';

export interface DebugDiagnosis {
  rootCause: string;
  hypotheses: string[];
  suggestedFix: string;
  confidence: number;
}

const debuggerSchema = `You are a debugger agent. Given the failure context, output STRICT JSON:
{
  "rootCause": string,
  "hypotheses": string[],
  "suggestedFix": string,
  "confidence": number
}`;

const parse = (content: string): DebugDiagnosis | null => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  try {
    const obj = JSON.parse(fence ? fence[1] : content);
    return {
      rootCause: String(obj.rootCause ?? ''),
      hypotheses: Array.isArray(obj.hypotheses) ? obj.hypotheses.map(String) : [],
      suggestedFix: String(obj.suggestedFix ?? ''),
      confidence:
        typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5,
    };
  } catch {
    return null;
  }
};

export interface DebuggerInput {
  failureMessage: string;
  failureContext: string;
  attemptsSoFar: number;
  relevantFiles?: string[];
}

export const diagnose = async (
  input: DebuggerInput,
  mode: import('../types').Mode,
): Promise<DebugDiagnosis> => {
  const prompt = assembleTaskPrompt({
    mode,
    title: 'Diagnose a failure',
    description: input.failureMessage,
    contextBlocks: input.failureContext
      ? [{ source: 'failure', content: input.failureContext }]
      : undefined,
    additionalUserText: `${debuggerSchema}

Failure:
${input.failureMessage}

Attempts: ${input.attemptsSoFar}

Context:
${input.failureContext}`,
  });
  try {
    const { response } = await callModel('debugger', mode, prompt.messages, {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 900,
      timeoutMs: 60_000,
    });
    const parsed = parse(response.content);
    if (parsed && parsed.rootCause) {
      // Opportunistic learning capture.
      upsertLearning({
        pattern: parsed.rootCause.slice(0, 200),
        context: (input.relevantFiles ?? []).join(',').slice(0, 200),
        fix: parsed.suggestedFix.slice(0, 400),
        confidence: parsed.confidence,
        success_count: 0,
        failure_count: 1,
        updated_at: new Date().toISOString(),
      });
    }
    return (
      parsed ?? {
        rootCause: 'unknown',
        hypotheses: [],
        suggestedFix: 'retry with narrower scope',
        confidence: 0.3,
      }
    );
  } catch (err) {
    log.warn('debugger failed', { err: String(err) });
    return {
      rootCause: 'debugger unavailable',
      hypotheses: [String(err)],
      suggestedFix: 'retry with different tool or escalate to user',
      confidence: 0.1,
    };
  }
};

export const debuggerAgent: Agent = {
  name: 'debugger',
  description: 'Performs root-cause analysis on failures.',
  async run(): Promise<AgentResult> {
    return { success: false, message: 'debugger.run is a delegate; use diagnose()' };
  },
};
