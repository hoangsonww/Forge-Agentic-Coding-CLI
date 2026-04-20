import { request } from 'undici';
import {
  ModelProvider,
  ModelDescriptor,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
} from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { classifyModel } from './local-catalog';

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
    // Hosted OpenAI: needs an API key; if we have one, trust it. Skipping
    // a probe here avoids an unnecessary network call per `forge` invocation.
    if (this.endpoint === 'https://api.openai.com/v1') {
      return Boolean(this.apiKey);
    }
    // Any other endpoint (LM Studio, vLLM, llama.cpp, LocalAI, Together…).
    // We need to actually reach the server or the router will happily send
    // traffic to a dead port. Short timeout keeps the probe cheap.
    try {
      const res = await request(`${this.endpoint}/models`, {
        method: 'GET',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        headersTimeout: 1_500,
        bodyTimeout: 1_500,
      });
      // Drain the body so undici doesn't keep the socket pinned.
      try {
        await res.body.dump();
      } catch {
        // ignore
      }
      return res.statusCode >= 200 && res.statusCode < 500;
    } catch {
      return false;
    }
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
      return (body.data ?? []).map((m) => {
        const meta = classifyModel(m.id);
        return {
          provider: this.name,
          id: m.id,
          class: meta.class,
          contextTokens: meta.contextTokens,
          supportsStreaming: true,
          roles: meta.roles,
        } as ModelDescriptor;
      });
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

// Model classification has moved to `./local-catalog.ts` so every provider
// stays consistent. See `classifyModel()`.
