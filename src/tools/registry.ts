/**
 * Registry for tools. Tools must be registered here to be accessible by name in plans and execution. The registry provides functions to register a tool, retrieve a tool by name, list all tools, and check for the existence of a tool. Tools are stored with an erased signature (using `AnyTool`) to allow for heterogeneous types while maintaining type safety at the individual tool level.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
