import { Tool } from '../types';
import { ForgeRuntimeError } from '../types/errors';

// Tools have narrow, tool-specific argument/return types. The registry stores
// them behind an erased signature so heterogeneous tools can live in one map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;

const registry: Map<string, AnyTool> = new Map();

export const registerTool = (tool: AnyTool): void => {
  registry.set(tool.schema.name, tool);
};

export const getTool = (name: string): AnyTool => {
  const t = registry.get(name);
  if (!t) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Tool '${name}' is not registered.`,
      retryable: false,
    });
  }
  return t;
};

export const allTools = (): AnyTool[] => [...registry.values()];

export const toolsByName = (names: string[]): AnyTool[] => names.map((n) => getTool(n));

export const hasTool = (name: string): boolean => registry.has(name);

export const clearTools = (): void => registry.clear();
