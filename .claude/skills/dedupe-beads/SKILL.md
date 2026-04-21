---
name: dedupe-beads
description: Merge duplicate or excessively overlapping beads in .beads/beads.jsonl into canonical ones. Run after any batch where 20+ new beads were created.
---

# /dedupe-beads

Large bead batches (100+) always develop duplicates. Run this as a
dedicated pass; don't try to do it inline during polishing.

## Prompt

Use the verbatim prompt at `.flywheel/prompts/dedupe-beads.md`.

## Merge rules

For each pair merged:

- Keep the **richest description** between the pair.
- Take the **union** of `depends_on` and `blocks` edges (dedupe).
- Keep the **higher priority** (lower number wins).
- Preserve **every** test obligation from both beads.
- Update any bead in `.beads/beads.jsonl` that referenced the
  deprecated id.

## Close vs delete

Prefer closing merged-away beads with a `closed_reason` pointing to
the canonical id, rather than deleting the line. Keeps the audit
trail clean.
