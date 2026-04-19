import * as crypto from 'crypto';

export const newTraceId = (): string => crypto.randomBytes(8).toString('hex');
export const newRunId = (): string => crypto.randomBytes(6).toString('hex');
export const newTaskId = (): string => `task_${crypto.randomBytes(6).toString('hex')}`;
export const newPlanId = (): string => `plan_${crypto.randomBytes(6).toString('hex')}`;
export const newSessionId = (): string => `sess_${crypto.randomBytes(6).toString('hex')}`;
export const newStepId = (index: number): string => `step_${String(index).padStart(3, '0')}`;
