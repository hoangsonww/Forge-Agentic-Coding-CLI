/**
 * Learning memory: patterns that Forge has seen before, with confidence
 * evolution. Strengthens after successful fixes, decays otherwise.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { getDb, upsertLearning, loadLearning, LearningRow } from '../persistence/index-db';

const migrate = (): void => {
  // learning_patterns table is created by index-db.migrate(). No-op here.
  getDb();
};

export interface Pattern {
  pattern: string;
  context: string;
  fix: string;
  confidence: number;
  successCount: number;
  failureCount: number;
}

const toPattern = (r: LearningRow): Pattern => ({
  pattern: r.pattern,
  context: r.context,
  fix: r.fix,
  confidence: r.confidence,
  successCount: r.success_count,
  failureCount: r.failure_count,
});

export const recordSuccess = (pattern: string, context: string, fix: string): void => {
  migrate();
  const existing = loadLearning(pattern, 1)[0];
  const successCount = (existing?.success_count ?? 0) + 1;
  const failureCount = existing?.failure_count ?? 0;
  const confidence = Math.min(1, (successCount + 1) / (successCount + failureCount + 2));
  upsertLearning({
    pattern,
    context,
    fix,
    confidence,
    success_count: successCount,
    failure_count: failureCount,
    updated_at: new Date().toISOString(),
  });
};

export const recordFailure = (pattern: string, context: string, fix: string): void => {
  migrate();
  const existing = loadLearning(pattern, 1)[0];
  const successCount = existing?.success_count ?? 0;
  const failureCount = (existing?.failure_count ?? 0) + 1;
  const confidence = Math.max(0, (successCount + 1) / (successCount + failureCount + 2));
  upsertLearning({
    pattern,
    context,
    fix,
    confidence,
    success_count: successCount,
    failure_count: failureCount,
    updated_at: new Date().toISOString(),
  });
};

export const relevantPatterns = (context: string, limit = 5): Pattern[] => {
  migrate();
  return loadLearning(context, limit).map(toPattern);
};

/**
 * Time-decay: patterns not reinforced in `days` lose confidence. Called from
 * the daemon on a schedule.
 */
export const decay = (days = 30, factor = 0.95): number => {
  migrate();
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = db
    .prepare(
      `UPDATE learning_patterns
       SET confidence = confidence * ?
       WHERE updated_at < ?`,
    )
    .run(factor, cutoff);
  return res.changes;
};

export const forgetAll = (): number => {
  migrate();
  const db = getDb();
  const res = db.prepare('DELETE FROM learning_patterns').run();
  return res.changes;
};
