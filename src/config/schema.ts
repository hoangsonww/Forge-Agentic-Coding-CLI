import { z } from 'zod';

export const modeEnum = z.enum([
  'fast',
  'balanced',
  'heavy',
  'plan',
  'execute',
  'audit',
  'debug',
  'architect',
  'offline-safe',
]);

export const updateChannelEnum = z.enum(['stable', 'beta', 'nightly']);

export const providerEnum = z.enum(['ollama', 'anthropic', 'openai', 'llamacpp', 'vllm']);

export const globalConfigSchema = z.object({
  version: z.string().default('1'),
  defaultMode: modeEnum.default('balanced'),
  defaultAgent: z.string().default('general'),
  provider: providerEnum.default('ollama'),
  models: z
    .object({
      fast: z.string().default('phi3:mini'),
      balanced: z.string().default('llama3:8b'),
      heavy: z.string().default('llama3:70b'),
      code: z.string().default('deepseek-coder:6.7b'),
      planner: z.string().default('qwen2.5:7b'),
    })
    .default({
      fast: 'phi3:mini',
      balanced: 'llama3:8b',
      heavy: 'llama3:70b',
      code: 'deepseek-coder:6.7b',
      planner: 'qwen2.5:7b',
    }),
  ollama: z
    .object({
      endpoint: z.string().default('http://127.0.0.1:11434'),
    })
    .default({ endpoint: 'http://127.0.0.1:11434' }),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().default('claude-opus-4-7'),
      endpoint: z.string().default('https://api.anthropic.com'),
    })
    .default({ model: 'claude-opus-4-7', endpoint: 'https://api.anthropic.com' }),
  update: z
    .object({
      autoCheck: z.boolean().default(true),
      notify: z.boolean().default(true),
      checkIntervalHours: z.number().int().positive().default(24),
      channel: updateChannelEnum.default('stable'),
      ignoredVersions: z.array(z.string()).default([]),
    })
    .default({
      autoCheck: true,
      notify: true,
      checkIntervalHours: 24,
      channel: 'stable',
      ignoredVersions: [],
    }),
  permissions: z
    .object({
      default: z.enum(['ask', 'allow', 'deny']).default('ask'),
      trust: z
        .object({
          autoAllowAfter: z.number().int().positive().default(3),
        })
        .default({ autoAllowAfter: 3 }),
    })
    .default({ default: 'ask', trust: { autoAllowAfter: 3 } }),
  concurrency: z
    .object({
      maxTasks: z.number().int().positive().default(4),
      maxGpuTasks: z.number().int().positive().default(1),
      maxFileWrites: z.number().int().positive().default(2),
    })
    .default({ maxTasks: 4, maxGpuTasks: 1, maxFileWrites: 2 }),
  notifications: z
    .object({
      enabled: z.boolean().default(true),
      channels: z.array(z.enum(['cli', 'ui', 'os'])).default(['cli']),
      osNotifications: z.boolean().default(false),
      verbosity: z.enum(['minimal', 'normal', 'verbose']).default('normal'),
      sound: z.boolean().default(false),
    })
    .default({
      enabled: true,
      channels: ['cli'],
      osNotifications: false,
      verbosity: 'normal',
      sound: false,
    }),
  completion: z
    .object({
      requireTests: z.boolean().default(false),
      requireReview: z.boolean().default(true),
      allowWarnings: z.boolean().default(true),
    })
    .default({ requireTests: false, requireReview: true, allowWarnings: true }),
  limits: z
    .object({
      maxSteps: z.number().int().positive().default(50),
      maxToolCalls: z.number().int().positive().default(100),
      maxRetries: z.number().int().positive().default(3),
      maxRuntimeSeconds: z.number().int().positive().default(600),
    })
    .default({
      maxSteps: 50,
      maxToolCalls: 100,
      maxRetries: 3,
      maxRuntimeSeconds: 600,
    }),
  memory: z
    .object({
      learningEnabled: z.boolean().default(true),
      coldRetentionDays: z.number().int().positive().default(90),
    })
    .default({ learningEnabled: true, coldRetentionDays: 90 }),
  web: z
    .object({
      maxPages: z.number().int().positive().default(5),
      maxDepth: z.number().int().positive().default(2),
      allowed: z.boolean().default(false),
    })
    .default({ maxPages: 5, maxDepth: 2, allowed: false }),
});

export const projectConfigSchema = z.object({
  version: z.string().default('1'),
  defaultAgent: z.string().optional(),
  defaultMode: modeEnum.optional(),
  skills: z
    .object({
      enabled: z.array(z.string()).optional(),
      autoDiscover: z.boolean().default(true),
    })
    .default({ autoDiscover: true }),
  mcp: z
    .object({
      enabled: z.array(z.string()).optional(),
    })
    .default({}),
  completion: z
    .object({
      requireTests: z.boolean().optional(),
      requireReview: z.boolean().optional(),
      allowWarnings: z.boolean().optional(),
    })
    .optional(),
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
