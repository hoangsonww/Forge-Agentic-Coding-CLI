/**
 * OpenAI-compatible provider. Works with api.openai.com out of the box and
 * with any local OpenAI-compatible server (llama.cpp `server`, vLLM,
 * LocalAI, Together, Azure OpenAI with a base-URL override).
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { request } from 'undici';
import {
  ModelProvider,
  ModelDescriptor,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
  ModelStreamChunk,
} from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { classifyModel } from './local-catalog';

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

  /**
   * Stream chat completions using SSE. Every OpenAI-compatible server —
   * api.openai.com, LM Studio, vLLM, llama.cpp `server`, LocalAI, Together —
   * emits `data: {...}\n\n` frames with a `[DONE]` sentinel. Parses
   * `choices[0].delta.content` as the incremental text and `usage` on the
   * terminal frame (when the server bothers to send it).
   */
  async *stream(
    model: string,
    messages: ModelMessage[],
    options: ModelCallOptions = {},
  ): AsyncGenerator<ModelStreamChunk, void, void> {
    const started = Date.now();
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.deterministic ? 0 : (options.temperature ?? 0.3),
      max_tokens: options.maxTokens ?? 2048,
      stop: options.stop,
      stream: true,
      stream_options: { include_usage: true },
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    let res;
    try {
      res = await request(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 600_000,
        headersTimeout: options.timeoutMs ?? 180_000,
      });
    } catch (err) {
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `${this.name} stream request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `${this.name} ${res.statusCode}: ${text.slice(0, 500)}`,
        retryable: res.statusCode === 429 || res.statusCode >= 500,
      });
    }

    let buffer = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: 'stop' | 'length' | 'tool_call' = 'stop';

    for await (const chunk of res.body as AsyncIterable<Buffer>) {
      buffer += chunk.toString('utf8');
      // SSE frames are separated by a blank line (\n\n).
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let obj: {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try {
            obj = JSON.parse(data);
          } catch {
            continue;
          }
          const delta = obj.choices?.[0]?.delta?.content ?? '';
          if (delta) yield { delta, done: false };
          const fr = obj.choices?.[0]?.finish_reason;
          if (fr)
            finishReason = fr === 'length' ? 'length' : fr === 'tool_calls' ? 'tool_call' : 'stop';
          if (obj.usage) {
            inputTokens = obj.usage.prompt_tokens;
            outputTokens = obj.usage.completion_tokens;
          }
        }
      }
    }
    yield {
      delta: '',
      done: true,
      model,
      provider: this.name,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
      finishReason,
    };
  }
}

// Model classification has moved to `./local-catalog.ts` so every provider
// stays consistent. See `classifyModel()`.
