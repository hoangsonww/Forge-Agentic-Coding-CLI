---
description: UI/dashboard rules — vanilla JS, no frameworks
globs:
  - "src/ui/**/*"
  - "src/web/**/*"
---

# UI rules

- The UI is a single vanilla-JS shell. **No frameworks, no CDN
  fetches, no build step for the UI.**
- `src/ui/public/app.js` must stay < 120 KB uncompressed (currently
  < 100 KB).
- No synchronous disk reads on the UI poll path or REPL redraw path.
- Watchers are ref-counted so multiple surfaces share one file
  watcher — preserve that pattern.
- Before adding a dependency, ask whether a ~20-line hand-written
  utility would do. It almost always does.
