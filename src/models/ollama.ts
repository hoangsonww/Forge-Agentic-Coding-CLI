import { request } from 'undici';
import {
  ModelProvider,
  ModelDescriptor,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
} from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { loadGlobalConfig } from '../config/loader';

const DEFAULT_ROLES_BY_SIZE = (name: string): ModelDescriptor['roles'] => {
  if (/phi|gemma|tiny/i.test(name)) return ['fast'];
  if (/deepseek|starcoder|codellama|code-/i.test(name)) return ['executor', 'fast'];
  if (/qwen/i.test(name)) return ['planner', 'debugger'];
  if (/mixtral|70b/i.test(name)) return ['architect', 'reviewer', 'planner'];
  return ['executor', 'planner'];
};

const classFor = (name: string): ModelDescriptor['class'] => {
  if (/phi|tiny|gemma/i.test(name)) return 'micro';
  if (/70b|mixtral|8x/i.test(name)) return 'heavy';
  if (/coder|code/i.test(name)) return 'specialized';
  return 'mid';
};

export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';

  constructor(private endpoint: string = loadGlobalConfig().ollama.endpoint) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await request(`${this.endpoint}/api/tags`, { method: 'GET' });
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    try {
      const res = await request(`${this.endpoint}/api/tags`, { method: 'GET' });
      if (res.statusCode !== 200) return [];
      const body = (await res.body.json()) as { models: Array<{ name: string; size?: number }> };
      return (body.models ?? []).map((m) => ({
        provider: 'ollama',
        id: m.name,
        class: classFor(m.name),
        contextTokens: 8192,
        supportsStreaming: true,
        roles: DEFAULT_ROLES_BY_SIZE(m.name),
      }));
    } catch {
      return [];
    }
  }

  async complete(
    model: string,
    messages: ModelMessage[],
    options: ModelCallOptions = {},
  ): Promise<ModelResponse> {
    const started = Date.now();
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      format: options.jsonMode ? 'json' : undefined,
      options: {
        temperature: options.deterministic ? 0 : (options.temperature ?? 0.2),
        num_predict: options.maxTokens ?? 2048,
        stop: options.stop,
      },
    };
    try {
      const res = await request(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 120_000,
        headersTimeout: options.timeoutMs ?? 120_000,
      });
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new ForgeRuntimeError({
          class: 'model_error',
          message: `Ollama ${res.statusCode}: ${text.slice(0, 500)}`,
          retryable: res.statusCode >= 500,
        });
      }
      const payload = (await res.body.json()) as {
        message?: { content?: string };
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        content: payload.message?.content ?? '',
        model,
        provider: 'ollama',
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
        durationMs: Date.now() - started,
        finishReason: payload.done_reason === 'length' ? 'length' : 'stop',
      };
    } catch (err) {
      if (err instanceof ForgeRuntimeError) throw err;
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Ollama request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
  }
}
