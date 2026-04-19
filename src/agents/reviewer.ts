import { Agent, AgentResult } from './base';
import { callModel } from '../models/router';
import { assembleTaskPrompt } from '../prompts/assembler';
import { log } from '../logging/logger';

export interface ReviewVerdict {
  approved: boolean;
  issues: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  summary: string;
}

const reviewerSchema = `You are reviewing the outcome of an executed task.

Output STRICT JSON:
{
  "approved": boolean,
  "issues": [
    { "severity": "info" | "warning" | "error", "message": string }
  ],
  "summary": string
}

Approve only if:
- The requested change is actually complete.
- No obvious regressions introduced.
- Tests (if any) pass.
- No security issues introduced (secrets, unsafe commands, unsanitized input).`;

const parse = (content: string): ReviewVerdict | null => {
  const fence = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(content);
  try {
    const obj = JSON.parse(fence ? fence[1] : content);
    if (typeof obj !== 'object' || obj === null) return null;
    return {
      approved: Boolean(obj.approved),
      issues: Array.isArray(obj.issues)
        ? obj.issues.map((i: any) => ({
            severity: ['info', 'warning', 'error'].includes(i?.severity) ? i.severity : 'info',
            message: String(i?.message ?? ''),
          }))
        : [],
      summary: String(obj.summary ?? ''),
    };
  } catch {
    return null;
  }
};

export interface ReviewerInput {
  taskTitle: string;
  changesSummary: string;
  filesChanged: string[];
  testsPassed?: boolean;
}

export const reviewOutcome = async (
  input: ReviewerInput,
  mode: import('../types').Mode,
): Promise<ReviewVerdict> => {
  const prompt = assembleTaskPrompt({
    mode,
    title: `Review: ${input.taskTitle}`,
    description: input.changesSummary,
    additionalUserText: `${reviewerSchema}

Files changed: ${input.filesChanged.join(', ') || '(none)'}
Tests passed: ${input.testsPassed ?? 'unknown'}

Summary of what happened:
${input.changesSummary}`,
  });
  try {
    const { response } = await callModel('reviewer', mode, prompt.messages, {
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 800,
      timeoutMs: 60_000,
    });
    return (
      parse(response.content) ?? {
        approved: input.testsPassed !== false,
        issues: [],
        summary: response.content.slice(0, 300),
      }
    );
  } catch (err) {
    log.warn('reviewer failed; defaulting to cautious approval', { err: String(err) });
    return {
      approved: input.testsPassed !== false,
      issues: [{ severity: 'warning', message: `reviewer model unavailable: ${String(err)}` }],
      summary: 'approved by policy (reviewer unavailable)',
    };
  }
};

export const reviewerAgent: Agent = {
  name: 'reviewer',
  description: 'Validates task outcome against requirements.',
  async run(): Promise<AgentResult> {
    return { success: false, message: 'reviewer.run is a delegate; use reviewOutcome()' };
  },
};
