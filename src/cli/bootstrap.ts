/**
 * Bootstrap function to initialize the Forge CLI environment. This includes setting up necessary directories, loading global configuration, and initializing providers, tools, and agents. The function ensures that these initialization steps are only performed once, even if called multiple times.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

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
