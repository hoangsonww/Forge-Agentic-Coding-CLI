/**
 * Agent registry — a simple in-memory registry for available agents. Provides
 * functions to register, retrieve, and list agents. Also includes an
 * initialization function to register built-in agents.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
