/**
 * Spec-driven development helper.
 *
 * Reads a spec file, extracts the user-facing task goal, and optionally a
 * rough sub-task list. Everything is fed into the standard agentic loop —
 * we don't introduce a second pipeline, we just prime the inputs.
 */
import * as fs from 'fs';
import { ForgeRuntimeError } from '../types/errors';

export interface ParsedSpec {
  title: string;
  description: string;
  tasks: string[];
  rawLength: number;
}

export const loadSpec = (filePath: string): ParsedSpec => {
  if (!fs.existsSync(filePath)) {
    throw new ForgeRuntimeError({
      class: 'not_found',
      message: `Spec file not found: ${filePath}`,
      retryable: false,
    });
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const titleMatch = /^#\s+(.+)$/m.exec(raw);
  const title = titleMatch ? titleMatch[1].trim() : 'spec';
  const tasks: string[] = [];

  // Extract actionable bullet lists from a "## Tasks" / "## Requirements" section, if present.
  const sectionMatch =
    /(##+\s*(tasks|requirements|acceptance criteria|todo)\s*\n)([\s\S]*?)(\n##\s|$)/i.exec(raw);
  if (sectionMatch) {
    for (const line of sectionMatch[3].split('\n')) {
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      if (bullet) tasks.push(bullet[1].trim());
    }
  }

  return {
    title,
    description: raw.slice(0, 8_000),
    tasks,
    rawLength: raw.length,
  };
};
