import * as fs from 'fs';
import * as path from 'path';
import { paths, projectConfigDir, ensureForgeHome } from './paths';
import { globalConfigSchema, projectConfigSchema, GlobalConfig, ProjectConfig } from './schema';

let cachedGlobal: GlobalConfig | null = null;

export const loadGlobalConfig = (force = false): GlobalConfig => {
  if (cachedGlobal && !force) return cachedGlobal;
  ensureForgeHome();
  if (!fs.existsSync(paths.globalConfig)) {
    const defaults = globalConfigSchema.parse({});
    fs.writeFileSync(paths.globalConfig, JSON.stringify(defaults, null, 2));
    cachedGlobal = defaults;
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(paths.globalConfig, 'utf8'));
    const parsed = globalConfigSchema.parse(raw);
    cachedGlobal = parsed;
    return parsed;
  } catch (err) {
    // Malformed config: fall back to defaults but do NOT overwrite, so the user
    // can inspect/repair. Surface via stderr.
    process.stderr.write(
      `[forge] Warning: global config at ${paths.globalConfig} is invalid. Using defaults. (${String(err)})\n`,
    );
    const defaults = globalConfigSchema.parse({});
    cachedGlobal = defaults;
    return defaults;
  }
};

export const saveGlobalConfig = (config: GlobalConfig): void => {
  ensureForgeHome();
  const validated = globalConfigSchema.parse(config);
  fs.writeFileSync(paths.globalConfig, JSON.stringify(validated, null, 2));
  cachedGlobal = validated;
};

export const updateGlobalConfig = (
  updater: (config: GlobalConfig) => GlobalConfig,
): GlobalConfig => {
  const next = updater(loadGlobalConfig(true));
  saveGlobalConfig(next);
  return next;
};

export const findProjectRoot = (startDir: string = process.cwd()): string | null => {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, projectConfigDir))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

export const loadProjectConfig = (projectRoot: string): ProjectConfig => {
  const cfgPath = path.join(projectRoot, projectConfigDir, 'config.json');
  if (!fs.existsSync(cfgPath)) {
    return projectConfigSchema.parse({});
  }
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return projectConfigSchema.parse(raw);
  } catch (err) {
    process.stderr.write(
      `[forge] Warning: project config at ${cfgPath} is invalid. Using defaults. (${String(err)})\n`,
    );
    return projectConfigSchema.parse({});
  }
};

export const saveProjectConfig = (projectRoot: string, config: ProjectConfig): void => {
  const dir = path.join(projectRoot, projectConfigDir);
  fs.mkdirSync(dir, { recursive: true });
  const validated = projectConfigSchema.parse(config);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(validated, null, 2));
};

export const loadInstructionFile = (filePath: string): string | null => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
};

export const loadGlobalInstructions = (): string | null =>
  loadInstructionFile(paths.globalInstructions);

export const loadProjectInstructions = (projectRoot: string): string | null =>
  loadInstructionFile(path.join(projectRoot, projectConfigDir, 'instructions.md'));
