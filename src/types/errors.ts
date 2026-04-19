import { ErrorClass, ForgeError } from './index';

export class ForgeRuntimeError extends Error implements ForgeError {
  readonly class: ErrorClass;
  readonly retryable: boolean;
  readonly recoveryHint?: string;
  readonly cause?: unknown;
  readonly traceId?: string;

  constructor(params: ForgeError) {
    super(params.message);
    this.name = 'ForgeRuntimeError';
    this.class = params.class;
    this.retryable = params.retryable;
    this.recoveryHint = params.recoveryHint;
    this.cause = params.cause;
    this.traceId = params.traceId;
  }

  toJSON(): ForgeError {
    return {
      class: this.class,
      message: this.message,
      retryable: this.retryable,
      recoveryHint: this.recoveryHint,
      cause: this.cause ? String(this.cause) : undefined,
      traceId: this.traceId,
    };
  }
}

export const isRetryable = (err: unknown): boolean => {
  if (err instanceof ForgeRuntimeError) return err.retryable;
  if (err && typeof err === 'object' && 'retryable' in err) {
    return Boolean((err as { retryable: unknown }).retryable);
  }
  return false;
};

export const classify = (err: unknown, fallback: ErrorClass = 'internal'): ErrorClass => {
  if (err instanceof ForgeRuntimeError) return err.class;
  return fallback;
};

export const wrap = (err: unknown, klass: ErrorClass, message: string): ForgeRuntimeError => {
  return new ForgeRuntimeError({
    class: klass,
    message,
    retryable: false,
    cause: err,
  });
};
