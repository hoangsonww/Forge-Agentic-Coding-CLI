/**
 * Hot memory: in-process working context for a task.
 *
 * Bounded by token budget (approximate, via 4-char-per-token heuristic).
 * Never persisted. Cleared when the task ends.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export interface HotEntry {
  source: string;
  content: string;
  priority: number;
  addedAt: number;
  tokens: number;
}

const approx = (s: string): number => Math.ceil(s.length / 4);

export class HotMemory {
  private entries: HotEntry[] = [];
  constructor(public budget = 6_000) {}

  push(source: string, content: string, priority = 1): void {
    this.entries.push({
      source,
      content,
      priority,
      addedAt: Date.now(),
      tokens: approx(content),
    });
    this.trim();
  }

  replace(source: string, content: string, priority = 1): void {
    this.entries = this.entries.filter((e) => e.source !== source);
    this.push(source, content, priority);
  }

  forget(source: string): void {
    this.entries = this.entries.filter((e) => e.source !== source);
  }

  snapshot(): HotEntry[] {
    return [...this.entries];
  }

  budgetUsed(): number {
    return this.entries.reduce((acc, e) => acc + e.tokens, 0);
  }

  clear(): void {
    this.entries = [];
  }

  private trim(): void {
    let over = this.budgetUsed() - this.budget;
    if (over <= 0) return;
    // Drop lowest-priority, then oldest.
    const sorted = [...this.entries].sort(
      (a, b) => a.priority - b.priority || a.addedAt - b.addedAt,
    );
    for (const victim of sorted) {
      if (over <= 0) break;
      this.entries = this.entries.filter((e) => e !== victim);
      over -= victim.tokens;
    }
  }
}
