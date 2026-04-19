import {
  ModelDescriptor,
  ModelMessage,
  ModelCallOptions,
  ModelResponse,
  ModelProvider,
} from '../types';
import { ForgeRuntimeError } from '../types/errors';
import { log } from '../logging/logger';

const providers: Map<string, ModelProvider> = new Map();

export const registerProvider = (p: ModelProvider): void => {
  providers.set(p.name, p);
};

export const getProvider = (name: string): ModelProvider => {
  const p = providers.get(name);
  if (!p) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Model provider '${name}' is not registered.`,
      retryable: false,
      recoveryHint: `Available: ${[...providers.keys()].join(', ') || '(none)'}`,
    });
  }
  return p;
};

export const listProviders = (): ModelProvider[] => [...providers.values()];

export const firstAvailableProvider = async (): Promise<ModelProvider | null> => {
  for (const p of providers.values()) {
    try {
      if (await p.isAvailable()) return p;
    } catch (err) {
      log.debug('provider availability probe failed', { provider: p.name, err: String(err) });
    }
  }
  return null;
};

export type { ModelProvider, ModelDescriptor, ModelMessage, ModelCallOptions, ModelResponse };
