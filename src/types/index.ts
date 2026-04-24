/**
 * Forge shared contracts.
 *
 * These types cross every layer (CLI, core, agents, persistence). Treat them
 * as load-bearing: if a field is added here, persistence/migrations need to
 * follow. Names match the planning docs verbatim where possible so that a
 * grep-driven audit of the spec is trivial.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

// ---------- Task lifecycle ----------

export type TaskStatus =
  | 'draft'
  | 'planned'
  | 'approved'
  | 'scheduled'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

// ---------- Operating modes ----------

export type Mode =
  | 'fast'
  | 'balanced'
  | 'heavy'
  | 'plan'
  | 'execute'
  | 'audit'
  | 'debug'
  | 'architect'
  | 'offline-safe';

export const DEFAULT_MODE: Mode = 'balanced';

// ---------- Task types & profile ----------

export type TaskType =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'analysis'
  | 'setup'
  | 'test'
  | 'optimization'
  | 'conversation'
  | 'other';

export type Complexity = 'trivial' | 'simple' | 'moderate' | 'complex';
export type Risk = 'low' | 'medium' | 'high' | 'critical';
export type Scope = 'single-file' | 'multi-file' | 'multi-module' | 'system-wide';

export interface TaskProfile {
  intent: TaskType;
  secondary: TaskType[];
  complexity: Complexity;
  scope: Scope;
  risk: Risk;
  requiresPlan: boolean;
  requiresTests: boolean;
  requiresReview: boolean;
  agents: string[];
  skills: string[];
  explanation: string;
}

// ---------- Plan (DAG) ----------

export type StepType =
  | 'analyze'
  | 'plan'
  | 'edit_file'
  | 'apply_patch'
  | 'create_file'
  | 'delete_file'
  | 'run_command'
  | 'run_tests'
  | 'review'
  | 'debug'
  | 'retrieve_context'
  | 'ask_user'
  | 'custom';

export interface PlanStep {
  id: string;
  type: StepType;
  description: string;
  target?: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
  risk?: Risk;
  estimatedSeconds?: number;
  tool?: string;
  agent?: string;
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: string;
  mode: Mode;
  version: string;
}

// ---------- Task ----------

export interface TaskResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  testsPassed?: boolean;
  durationMs: number;
  errors?: ForgeError[];
  // Explainability fields (populated when available). See Reliability Layer §18.
  whatChanged?: string;
  whyChanged?: string;
  alternativesConsidered?: string[];
  costUsd?: number;
  tokensUsed?: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  mode: Mode;
  profile?: TaskProfile;
  plan?: Plan;
  parentTaskId?: string;
  dependencies: string[];
  traceId: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  attempts: number;
  maxAttempts: number;
}

// ---------- Events & sessions ----------

export type EventType =
  | 'TASK_CREATED'
  | 'TASK_CLASSIFIED'
  | 'TASK_PLANNED'
  | 'TASK_APPROVED'
  | 'TASK_SCHEDULED'
  | 'TASK_STARTED'
  | 'TASK_STEP_STARTED'
  | 'TASK_STEP_COMPLETED'
  | 'TASK_STEP_FAILED'
  | 'TASK_VERIFYING'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'TASK_BLOCKED'
  | 'TASK_CANCELLED'
  | 'TOOL_CALLED'
  | 'TOOL_COMPLETED'
  | 'TOOL_FAILED'
  | 'MODEL_CALLED'
  | 'MODEL_DELTA'
  | 'MODEL_COMPLETED'
  | 'MODEL_FAILED'
  | 'MODEL_WARMING'
  | 'MODEL_WARMED'
  | 'PERMISSION_REQUESTED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_DENIED'
  | 'INPUT_REQUIRED'
  | 'INPUT_RECEIVED'
  | 'RETRY_ATTEMPTED'
  | 'ESCALATED'
  | 'UPDATE_AVAILABLE'
  | 'LEARNING_PATTERN_STORED'
  | 'MCP_CONNECTION_CHANGED';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface ForgeEvent {
  type: EventType;
  taskId?: string;
  projectId?: string;
  traceId?: string;
  runId?: string;
  severity: Severity;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface SessionEntry {
  type: 'user' | 'assistant' | 'plan' | 'tool_call' | 'tool_result' | 'result' | 'event';
  agent?: string;
  content: unknown;
  timestamp: string;
  traceId?: string;
}

// ---------- Models ----------

export type ModelRole = 'planner' | 'architect' | 'executor' | 'reviewer' | 'debugger' | 'fast';

export interface ModelDescriptor {
  provider: string;
  id: string;
  class: 'micro' | 'mid' | 'heavy' | 'specialized';
  contextTokens: number;
  supportsStreaming?: boolean;
  roles: ModelRole[];
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelCallOptions {
  temperature?: number;
  maxTokens?: number;
  deterministic?: boolean;
  timeoutMs?: number;
  jsonMode?: boolean;
  stop?: string[];
}

export interface ModelResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  finishReason?: 'stop' | 'length' | 'error' | 'tool_call';
}

/**
 * One frame of a streaming completion. Providers yield any number of
 * `done:false` chunks (each carrying a text `delta`), terminated by a single
 * `done:true` chunk that may also carry usage, finishReason, and duration.
 * The final `delta` on a done:true frame is usually empty but implementations
 * may concatenate it verbatim.
 */
export interface ModelStreamChunk {
  delta: string;
  done: boolean;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  finishReason?: 'stop' | 'length' | 'error' | 'tool_call';
}

export interface ModelProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelDescriptor[]>;
  complete(
    model: string,
    messages: ModelMessage[],
    options?: ModelCallOptions,
  ): Promise<ModelResponse>;
  /**
   * Optional streaming completion. When absent, callers should treat the
   * provider as non-streaming and fall back to `complete()`.
   */
  stream?(
    model: string,
    messages: ModelMessage[],
    options?: ModelCallOptions,
  ): AsyncIterable<ModelStreamChunk>;
  /**
   * Optional pre-warm hook. For runtimes that load models into RAM/VRAM on
   * demand (Ollama, LM Studio), calling `warm` before the first real call
   * hides the cold-load latency behind an explicit "warming" phase instead
   * of a mysterious headers-timeout. Should be idempotent — already-loaded
   * models return quickly. Must not throw: failures are treated as "did
   * what we could" and the next real call surfaces any real error.
   */
  warm?(model: string): Promise<void>;
}

// ---------- Prompts ----------

export type PromptLayer =
  | 'system_core'
  | 'mode'
  | 'global_instructions'
  | 'project_instructions'
  | 'task_instructions'
  | 'context'
  | 'tools'
  | 'user_input';

export interface PromptSegment {
  layer: PromptLayer;
  content: string;
  priority: number;
  tokens?: number;
}

export interface AssembledPrompt {
  messages: ModelMessage[];
  manifest: PromptSegment[];
  hash: string;
  mode: Mode;
  version: string;
}

// ---------- Tools ----------

export type SideEffect = 'pure' | 'readonly' | 'write' | 'network' | 'execute';

export interface ToolSchema {
  name: string;
  description: string;
  sideEffect: SideEffect;
  risk: Risk;
  permissionDefault: 'ask' | 'allow' | 'deny';
  sensitivity: 'low' | 'medium' | 'high';
  timeoutMs: number;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  taskId: string;
  projectId: string;
  projectRoot: string;
  traceId: string;
  runId: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: ForgeError;
  durationMs: number;
}

export interface Tool<TArgs = Record<string, unknown>, TOutput = unknown> {
  schema: ToolSchema;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

// ---------- Agents ----------

export interface AgentManifest {
  name: string;
  description: string;
  capabilities: string[];
  defaultMode: Mode;
  tools: string[];
  skills: string[];
  behavior?: string;
}

export interface AgentContext {
  task: Task;
  projectRoot: string;
  mode: Mode;
}

// ---------- Skills ----------

export interface SkillManifest {
  name: string;
  description: string;
  inputs: string[];
  tools: string[];
  tags: string[];
  body: string;
}

// ---------- Permissions ----------

export type PermissionDecision = 'allow' | 'deny' | 'allow_session' | 'ask';

export interface PermissionRequest {
  tool: string;
  risk: Risk;
  sideEffect: SideEffect;
  sensitivity: 'low' | 'medium' | 'high';
  action: string;
  target?: string;
  projectId: string;
  taskId?: string;
}

export interface PermissionGrant {
  tool: string;
  scope: 'once' | 'session' | 'project' | 'global';
  grantedAt: string;
  expiresAt?: string;
}

// ---------- Errors ----------

export type ErrorClass =
  | 'user_input'
  | 'permission_denied'
  | 'policy_violation'
  | 'sandbox_violation'
  | 'injection_attempt'
  | 'model_error'
  | 'tool_error'
  | 'plan_invalid'
  | 'state_invalid'
  | 'resource_exhausted'
  | 'timeout'
  | 'retry_exhausted'
  | 'not_found'
  | 'conflict'
  | 'internal';

export interface ForgeError {
  class: ErrorClass;
  message: string;
  retryable: boolean;
  recoveryHint?: string;
  cause?: unknown;
  traceId?: string;
}

// ---------- Project identity ----------

export interface ProjectIdentity {
  id: string;
  path: string;
  name: string;
  createdAt: string;
  lastOpened: string;
}

// ---------- MCP ----------

export type McpTransport = 'stdio' | 'http_stream' | 'websocket';
export type McpAuthMethod = 'none' | 'api_key' | 'oauth' | 'basic';

export interface McpConnection {
  id: string;
  name: string;
  transport: McpTransport;
  endpoint?: string;
  command?: string;
  args?: string[];
  auth: McpAuthMethod;
  status: 'connected' | 'disconnected' | 'error' | 'reauth_required';
  lastUsedAt?: string;
  tools?: string[];
}

// ---------- Completion policy ----------

export interface CompletionPolicy {
  requireTests: boolean;
  requireReview: boolean;
  allowWarnings: boolean;
}

export interface ExecutionLimits {
  maxSteps: number;
  maxToolCalls: number;
  maxRetries: number;
  maxRuntimeSeconds: number;
}

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxSteps: 50,
  maxToolCalls: 100,
  maxRetries: 3,
  maxRuntimeSeconds: 600,
};

export const DEFAULT_COMPLETION_POLICY: CompletionPolicy = {
  requireTests: false,
  requireReview: true,
  allowWarnings: true,
};

// ---------- Priority order (authoritative) ----------

export const INSTRUCTION_PRIORITY = [
  'system_safety',
  'page_rules',
  'mode_rules',
  'approved_task_plan',
  'project_defaults',
  'user_preferences',
] as const;
export type InstructionLayer = (typeof INSTRUCTION_PRIORITY)[number];
