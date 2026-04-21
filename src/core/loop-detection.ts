/**
 * Detects pathological retry patterns (edit → fail → edit → fail …) so the
 * orchestrator can break out early instead of burning retries. The signal
 * is simple: if the last N step outcomes are all `false` for the same step
 * id with a similar error class, call it a loop.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
export interface StepOutcome {
  stepId: string;
  success: boolean;
  errorClass?: string;
  timestamp: number;
}

export class LoopDetector {
  private history: StepOutcome[] = [];
  constructor(
    private windowSize = 6,
    private repetitionThreshold = 3,
  ) {}

  record(outcome: StepOutcome): void {
    this.history.push(outcome);
    if (this.history.length > this.windowSize) this.history.shift();
  }

  isLooping(): { looping: boolean; reason: string | null } {
    if (this.history.length < this.repetitionThreshold) return { looping: false, reason: null };
    const tail = this.history.slice(-this.repetitionThreshold);
    const sameStep = tail.every((e) => e.stepId === tail[0].stepId);
    const sameClass =
      tail.every((e) => e.errorClass === tail[0].errorClass) && Boolean(tail[0].errorClass);
    const allFailing = tail.every((e) => !e.success);
    if (allFailing && sameStep && sameClass) {
      return {
        looping: true,
        reason: `step ${tail[0].stepId} failed ${tail.length} times with ${tail[0].errorClass}`,
      };
    }
    return { looping: false, reason: null };
  }

  reset(): void {
    this.history.length = 0;
  }
}
