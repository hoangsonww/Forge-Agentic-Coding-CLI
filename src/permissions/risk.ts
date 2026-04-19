import { Risk, SideEffect, Tool, ToolSchema } from '../types';

/**
 * Risk-scoring helpers. Called whenever we need a decision about whether a
 * tool invocation is routine or needs explicit approval.
 */
export const riskRank = (r: Risk): number =>
  (({ low: 0, medium: 1, high: 2, critical: 3 }) as const)[r];

export const maxRisk = (a: Risk, b: Risk): Risk => (riskRank(a) >= riskRank(b) ? a : b);

export const requiresExplicitApproval = (schema: ToolSchema): boolean => {
  if (schema.risk === 'critical' || schema.risk === 'high') return true;
  if (schema.sideEffect === 'execute' || schema.sideEffect === 'network') return true;
  return false;
};

export const mergeRisk = (toolRisk: Risk, actionRisk: Risk): Risk => maxRisk(toolRisk, actionRisk);

export const shouldAlwaysAsk = (
  tool: Pick<ToolSchema, 'risk' | 'sideEffect'>,
  skipRoutinePrompts: boolean,
): boolean => {
  // `--skip-permissions` drops only *routine* prompts (low/medium). High-risk
  // and destructive actions always require explicit approval — this matches
  // the spec's baseline in Operational Control §8.4.
  if (tool.risk === 'critical' || tool.risk === 'high') return true;
  if (tool.sideEffect === 'execute' || tool.sideEffect === 'network') return true;
  return !skipRoutinePrompts;
};

export const describeSideEffect = (side: SideEffect): string =>
  ({
    pure: 'no side effect',
    readonly: 'reads only',
    write: 'writes files',
    network: 'makes network calls',
    execute: 'executes shell commands',
  })[side];

export const summarizeTool = (tool: Tool): string =>
  `${tool.schema.name} [${tool.schema.risk}/${tool.schema.sideEffect}]: ${tool.schema.description}`;
