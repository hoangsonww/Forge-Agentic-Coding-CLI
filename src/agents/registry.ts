import { Agent } from './base';
import { plannerAgent } from './planner';
import { executorAgent } from './executor';
import { reviewerAgent } from './reviewer';
import { debuggerAgent } from './debugger';
import { architectAgent } from './architect';
import { memoryAgent } from './memory';

const agents = new Map<string, Agent>();

export const registerAgent = (agent: Agent): void => {
  agents.set(agent.name, agent);
};

export const getAgent = (name: string): Agent | undefined => agents.get(name);

export const listAgents = (): Agent[] => [...agents.values()];

let initialized = false;
export const initAgents = (): void => {
  if (initialized) return;
  registerAgent(plannerAgent);
  registerAgent(executorAgent);
  registerAgent(reviewerAgent);
  registerAgent(debuggerAgent);
  registerAgent(architectAgent);
  registerAgent(memoryAgent);
  initialized = true;
};
