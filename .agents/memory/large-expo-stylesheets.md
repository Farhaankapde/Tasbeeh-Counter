---
name: Large Expo stylesheets
description: Safe editing guidance for the Tasbeeh app’s long single-line React Native StyleSheet blocks.
---

Use narrowly targeted edits when changing the app stylesheet; preserve the surrounding style definitions and verify TypeScript immediately afterward.

**Why:** The stylesheet contains many definitions on long lines, so a broad replacement can silently remove unrelated styles while leaving the file syntactically valid.

**How to apply:** Change only the named style property or use a tightly scoped replacement, then run the app typecheck before visual verification.