/**
 * Anthropic provider — enterprise fallback when local models aren't present.
 * Local-first doctrine still holds (Ollama is preferred), but users can opt
 * into the Claude API for reliability or when running on laptops without a
 * capable local runtime.
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
import { loadGlobalConfig } from '../config/loader';

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';

  constructor(
    private apiKey: string | undefined = loadGlobalConfig().anthropic.apiKey ??
      process.env.ANTHROPIC_API_KEY,
    private endpoint: string = loadGlobalConfig().anthropic.endpoint,
  ) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async listModels(): Promise<ModelDescriptor[]> {
    if (!this.apiKey) return [];
    return [
      {
        provider: 'anthropic',
        id: 'claude-opus-4-7',
        class: 'heavy',
        contextTokens: 200_000,
        supportsStreaming: true,
        roles: ['architect', 'planner', 'reviewer', 'debugger'],
      },
      {
        provider: 'anthropic',
        id: 'claude-sonnet-4-6',
        class: 'mid',
        contextTokens: 200_000,
        supportsStreaming: true,
        roles: ['planner', 'executor', 'reviewer'],
      },
      {
        provider: 'anthropic',
        id: 'claude-haiku-4-5-20251001',
        class: 'micro',
        contextTokens: 200_000,
        supportsStreaming: true,
        roles: ['fast', 'executor'],
      },
    ];
  }

  async complete(
    model: string,
    messages: ModelMessage[],
    options: ModelCallOptions = {},
  ): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: 'Anthropic provider selected but ANTHROPIC_API_KEY is not set.',
        retryable: false,
        recoveryHint:
          'Set ANTHROPIC_API_KEY or configure anthropic.apiKey in ~/.forge/config.json.',
      });
    }
    const started = Date.now();
    // Anthropic API expects system as a top-level field.
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.deterministic ? 0 : (options.temperature ?? 0.3),
    };
    if (systemParts.length) body.system = systemParts.join('\n\n');
    if (options.stop) body.stop_sequences = options.stop;

    try {
      const res = await request(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 180_000,
        headersTimeout: options.timeoutMs ?? 180_000,
      });
      if (res.statusCode !== 200) {
        const text = await res.body.text();
        throw new ForgeRuntimeError({
          class: 'model_error',
          message: `Anthropic ${res.statusCode}: ${text.slice(0, 500)}`,
          retryable: res.statusCode === 429 || res.statusCode >= 500,
        });
      }
      const data = (await res.body.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        stop_reason?: string;
      };
      const content = (data.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
      return {
        content,
        model,
        provider: 'anthropic',
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        durationMs: Date.now() - started,
        finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      };
    } catch (err) {
      if (err instanceof ForgeRuntimeError) throw err;
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Anthropic request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
  }

  /**
   * Stream messages from Anthropic's /v1/messages SSE endpoint. Anthropic's
   * wire format is event-typed SSE: `event: content_block_delta` frames carry
   * text deltas under `.delta.text`; `message_delta` carries usage updates;
   * `message_stop` terminates. We coalesce those into our provider-neutral
   * `ModelStreamChunk` shape.
   */
  async *stream(
    model: string,
    messages: ModelMessage[],
    options: ModelCallOptions = {},
  ): AsyncGenerator<ModelStreamChunk, void, void> {
    if (!this.apiKey) {
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: 'Anthropic provider selected but ANTHROPIC_API_KEY is not set.',
        retryable: false,
      });
    }
    const started = Date.now();
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.deterministic ? 0 : (options.temperature ?? 0.3),
      stream: true,
    };
    if (systemParts.length) body.system = systemParts.join('\n\n');
    if (options.stop) body.stop_sequences = options.stop;

    let res;
    try {
      res = await request(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'anthropic-version': '2023-06-01',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 600_000,
        headersTimeout: options.timeoutMs ?? 180_000,
      });
    } catch (err) {
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Anthropic stream request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Anthropic ${res.statusCode}: ${text.slice(0, 500)}`,
        retryable: res.statusCode === 429 || res.statusCode >= 500,
      });
    }

    let buffer = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: 'stop' | 'length' = 'stop';

    for await (const chunk of res.body as AsyncIterable<Buffer>) {
      buffer += chunk.toString('utf8');
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
        let eventType = '';
        let dataLine = '';
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
        }
        if (!dataLine) continue;
        let data: {
          type?: string;
          delta?: { type?: string; text?: string; stop_reason?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        };
        try {
          data = JSON.parse(dataLine);
        } catch {
          continue;
        }
        if (eventType === 'content_block_delta' && data.delta?.type === 'text_delta') {
          const delta = data.delta.text ?? '';
          if (delta) yield { delta, done: false };
        } else if (eventType === 'message_start' && data.message?.usage) {
          inputTokens = data.message.usage.input_tokens ?? inputTokens;
        } else if (eventType === 'message_delta') {
          if (data.usage?.output_tokens != null) outputTokens = data.usage.output_tokens;
          const sr = data.delta?.stop_reason;
          if (sr === 'max_tokens') finishReason = 'length';
          else if (sr) finishReason = 'stop';
        }
      }
    }
    yield {
      delta: '',
      done: true,
      model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
      finishReason,
    };
  }
}
