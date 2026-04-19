/**
 * XDG Base Directory support. If the user has set XDG_DATA_HOME /
 * XDG_CONFIG_HOME we respect them for Forge's home location. Keeps us
 * well-behaved on Linux desktops and inside Flatpak/containers.
 *
 * Precedence:
 *   FORGE_HOME > XDG_DATA_HOME/forge > ~/.forge
 */
import * as os from 'os';
import * as path from 'path';

export const resolveForgeHome = (): string => {
  if (process.env.FORGE_HOME) return process.env.FORGE_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'forge');
  return path.join(os.homedir(), '.forge');
};
