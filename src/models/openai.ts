import { request } from 'undici';
import {
  ModelProvider,
  ModelDescriptor,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
} from '../types';
import { ForgeRuntimeError } from '../types/errors';

/**
 * OpenAI-compatible provider. Works with api.openai.com out of the box and
 * with any local OpenAI-compatible server (llama.cpp `server`, vLLM,
 * LocalAI, Together, Azure OpenAI with a base-URL override).
 */
export class OpenAIProvider implements ModelProvider {
  readonly name: string;

  constructor(
    private apiKey: string | undefined = process.env.OPENAI_API_KEY,
    private endpoint: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    name = 'openai',
  ) {
    this.name = name;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey) || this.endpoint !== 'https://api.openai.com/v1';
  }

  async listModels(): Promise<ModelDescriptor[]> {
    if (!(await this.isAvailable())) return [];
    try {
      const res = await request(`${this.endpoint}/models`, {
        method: 'GET',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });
      if (res.statusCode !== 200) return [];
      const body = (await res.body.json()) as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => ({
        provider: this.name,
        id: m.id,
        class: inferClass(m.id),
        contextTokens: inferContext(m.id),
        supportsStreaming: true,
        roles: inferRoles(m.id),
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
      temperature: options.deterministic ? 0 : (options.temperature ?? 0.3),
      max_tokens: options.maxTokens ?? 2048,
      stop: options.stop,
      stream: false,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    try {
      const res = await request(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 180_000,
        headersTimeout: options.timeoutMs ?? 180_000,
      });
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new ForgeRuntimeError({
          class: 'model_error',
          message: `${this.name} ${res.statusCode}: ${text.slice(0, 500)}`,
          retryable: res.statusCode === 429 || res.statusCode >= 500,
        });
      }
      const data = (await res.body.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const finish = data.choices?.[0]?.finish_reason;
      return {
        content,
        model,
        provider: this.name,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        durationMs: Date.now() - started,
        finishReason:
          finish === 'length' ? 'length' : finish === 'tool_calls' ? 'tool_call' : 'stop',
      };
    } catch (err) {
      if (err instanceof ForgeRuntimeError) throw err;
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `${this.name} request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
  }
}

const inferClass = (id: string): ModelDescriptor['class'] => {
  if (/gpt-?4|o1|o3/i.test(id)) return 'heavy';
  if (/gpt-?3\.5|mini|haiku/i.test(id)) return 'mid';
  if (/embedding|tiny|phi|7b\b/i.test(id)) return 'micro';
  if (/code|coder/i.test(id)) return 'specialized';
  return 'mid';
};

const inferContext = (id: string): number => {
  if (/128k|turbo/i.test(id)) return 128_000;
  if (/32k/.test(id)) return 32_000;
  if (/o1|o3|4-turbo|4o/i.test(id)) return 128_000;
  return 16_000;
};

const inferRoles = (id: string): ModelDescriptor['roles'] => {
  if (/code|coder/i.test(id)) return ['executor', 'fast'];
  if (/mini|haiku|nano/i.test(id)) return ['fast', 'executor'];
  if (/o1|o3|opus/i.test(id)) return ['architect', 'planner', 'reviewer', 'debugger'];
  return ['planner', 'executor', 'reviewer'];
};
