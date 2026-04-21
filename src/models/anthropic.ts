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
}
