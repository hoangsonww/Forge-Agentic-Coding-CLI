/**
 * Ollama provider — local-first model provider, querying a user-provided Ollama endpoint for available models and completions. The provider is designed to be resilient to Ollama being unavailable (e.g. not installed, not running), in which case it simply won't appear in the list of providers and the user can still use other providers like Anthropic if configured.
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
import { classifyModel } from './local-catalog';

// Ollama cold-loads a model into RAM/VRAM before it streams the first byte of
// a reply. That window is unrelated to generation, and can exceed the agent's
// per-call `timeoutMs` (60–90s) on first use of a large model. Floor the
// *headers* timeout so we don't flip to the hosted fallback while Ollama is
// still loading. Override with FORGE_OLLAMA_HEADERS_TIMEOUT_MS (ms).
const headersTimeoutFloor = (): number => {
  const env = Number(process.env.FORGE_OLLAMA_HEADERS_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : 300_000;
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

  /**
   * Pre-load a model into memory so the first real call doesn't eat the
   * cold-load latency. Uses Ollama's /api/generate with an empty prompt —
   * the documented idiom for warming. `keep_alive:"5m"` matches Ollama's
   * default so we don't accidentally shorten the resident window.
   *
   * Cheap (~50ms) when the model is already loaded, blocking for the
   * real cold-load otherwise. Never throws: a warm failure is not worth
   * failing the run; the real call will surface any concrete error.
   */
  async warm(model: string): Promise<void> {
    try {
      // Cheap preflight: skip the warm if Ollama already has the model
      // resident. /api/ps lists currently-loaded models.
      try {
        const ps = await request(`${this.endpoint}/api/ps`, {
          method: 'GET',
          headersTimeout: 2_000,
          bodyTimeout: 2_000,
        });
        if (ps.statusCode === 200) {
          const body = (await ps.body.json()) as { models?: Array<{ name?: string }> };
          if ((body.models ?? []).some((m) => m.name === model)) return;
        } else {
          try {
            await ps.body.dump();
          } catch {
            // ignore
          }
        }
      } catch {
        // Older Ollama (<0.1.33) doesn't have /api/ps — fall through to warm.
      }
      const res = await request(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, keep_alive: '5m' }),
        // Warm is allowed to take a while — first-time load of a 7B can
        // exceed a minute on slower machines. 10 min is a defensible cap.
        bodyTimeout: 600_000,
        headersTimeout: Math.max(headersTimeoutFloor(), 600_000),
      });
      try {
        await res.body.dump();
      } catch {
        // ignore
      }
    } catch {
      // Swallow — caller will get a clearer error from the real call.
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    try {
      const res = await request(`${this.endpoint}/api/tags`, { method: 'GET' });
      if (res.statusCode !== 200) return [];
      const body = (await res.body.json()) as { models: Array<{ name: string; size?: number }> };
      return (body.models ?? []).map((m) => {
        const meta = classifyModel(m.name);
        return {
          provider: 'ollama',
          id: m.name,
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
        headersTimeout: Math.max(options.timeoutMs ?? 0, headersTimeoutFloor()),
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

  /**
   * Stream a chat completion. Ollama speaks line-delimited JSON: one object
   * per chunk, each with `message.content` plus a `done:true` marker on the
   * final frame. We yield deltas as they arrive and a terminal frame carrying
   * usage/finish metadata.
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
      stream: true,
      format: options.jsonMode ? 'json' : undefined,
      options: {
        temperature: options.deterministic ? 0 : (options.temperature ?? 0.2),
        num_predict: options.maxTokens ?? 2048,
        stop: options.stop,
      },
    };
    let res;
    try {
      res = await request(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        bodyTimeout: options.timeoutMs ?? 600_000,
        headersTimeout: Math.max(options.timeoutMs ?? 0, headersTimeoutFloor()),
      });
    } catch (err) {
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Ollama stream request failed: ${String(err)}`,
        retryable: true,
        cause: err,
      });
    }
    if (res.statusCode !== 200) {
      const text = await res.body.text();
      throw new ForgeRuntimeError({
        class: 'model_error',
        message: `Ollama ${res.statusCode}: ${text.slice(0, 500)}`,
        retryable: res.statusCode >= 500,
      });
    }

    let buffer = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: 'stop' | 'length' = 'stop';

    for await (const chunk of res.body as AsyncIterable<Buffer>) {
      buffer += chunk.toString('utf8');
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line) continue;
        let obj: {
          message?: { content?: string };
          done?: boolean;
          done_reason?: string;
          prompt_eval_count?: number;
          eval_count?: number;
        };
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const delta = obj.message?.content ?? '';
        if (delta) yield { delta, done: false };
        if (obj.done) {
          inputTokens = obj.prompt_eval_count;
          outputTokens = obj.eval_count;
          finishReason = obj.done_reason === 'length' ? 'length' : 'stop';
        }
      }
    }
    yield {
      delta: '',
      done: true,
      model,
      provider: 'ollama',
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
      finishReason,
    };
  }
}
