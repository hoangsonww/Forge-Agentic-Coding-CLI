import * as crypto from 'crypto';

/**
 * Trace and span ID generation for logging and telemetry.
 *
 * Each trace represents a single execution flow (e.g., a user command or an agent run),
 * and spans represent individual steps or tasks within that flow. IDs are generated
 * as random hex strings for uniqueness and correlation in logs and telemetry.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export const newTraceId = (): string => crypto.randomBytes(8).toString('hex');
export const newRunId = (): string => crypto.randomBytes(6).toString('hex');
export const newTaskId = (): string => `task_${crypto.randomBytes(6).toString('hex')}`;
export const newPlanId = (): string => `plan_${crypto.randomBytes(6).toString('hex')}`;
export const newSessionId = (): string => `sess_${crypto.randomBytes(6).toString('hex')}`;
export const newStepId = (index: number): string => `step_${String(index).padStart(3, '0')}`;
