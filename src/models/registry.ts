import { registerProvider } from './provider';
import { OllamaProvider } from './ollama';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { LlamaCppProvider } from './llamacpp';
import { VllmProvider } from './vllm';
import { LmStudioProvider } from './lmstudio';
import * as rateLimit from './rate-limit';
import * as breaker from './circuit-breaker';

let initialized = false;

export const initProviders = (): void => {
  if (initialized) return;
  registerProvider(new OllamaProvider());
  registerProvider(new AnthropicProvider());
  registerProvider(new OpenAIProvider());
  registerProvider(new LlamaCppProvider());
  registerProvider(new VllmProvider());
  registerProvider(new LmStudioProvider());

  // Sensible default limits. Local runtimes aren't rate-limited; remote
  // providers get conservative caps so bursts don't trip 429s.
  rateLimit.configure('anthropic', { capacity: 30, refillPerSec: 2 });
  rateLimit.configure('openai', { capacity: 60, refillPerSec: 3 });
  breaker.configure('anthropic', { failureThreshold: 4, resetMs: 30_000 });
  breaker.configure('openai', { failureThreshold: 4, resetMs: 30_000 });
  breaker.configure('ollama', { failureThreshold: 6, resetMs: 10_000 });
  breaker.configure('llamacpp', { failureThreshold: 6, resetMs: 10_000 });
  breaker.configure('vllm', { failureThreshold: 6, resetMs: 10_000 });
  breaker.configure('lmstudio', { failureThreshold: 6, resetMs: 10_000 });

  initialized = true;
};
