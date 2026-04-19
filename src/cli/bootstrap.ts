import { initProviders } from '../models/registry';
import { initTools } from '../tools/init';
import { initAgents } from '../agents/registry';
import { ensureForgeHome } from '../config/paths';
import { loadGlobalConfig } from '../config/loader';

let done = false;

export const bootstrap = (): void => {
  if (done) return;
  ensureForgeHome();
  loadGlobalConfig();
  initProviders();
  initTools();
  initAgents();
  done = true;
};
