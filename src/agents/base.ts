import { Mode, Task } from '../types';
import { AssembledPrompt } from '../types';

/**
 * This file defines the base interfaces for agents in the system. An agent is a component that can execute tasks based on a given context. The Agent interface specifies the structure that all agents must follow, including a name, description, and a run method that takes an execution context and returns a result.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface AgentExecutionContext {
  task: Task;
  projectRoot: string;
  mode: Mode;
}

export interface Agent {
  readonly name: string;
  readonly description: string;
  run(ctx: AgentExecutionContext): Promise<AgentResult>;
}

export interface AgentResult {
  success: boolean;
  output?: unknown;
  message?: string;
  prompt?: AssembledPrompt;
  filesChanged?: string[];
}
