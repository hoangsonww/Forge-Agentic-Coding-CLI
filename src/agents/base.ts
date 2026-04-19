import { Mode, Task } from '../types';
import { AssembledPrompt } from '../types';

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
