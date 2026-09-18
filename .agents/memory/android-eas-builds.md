---
name: Android EAS builds
description: Environment constraint for producing Android release artifacts from Expo projects in this workspace.
---

Replit can develop and preview the Expo app, but native EAS compilation is not available inside the Replit environment; Android release builds must be initiated through an external authenticated EAS workflow.

**Why:** Replit’s supported mobile publishing flow does not currently provide Google Play publishing or EAS native compilation.

**How to apply:** Keep Android production settings in the artifact’s EAS configuration, validate Expo metadata in Replit, and direct the user to generate and download the AAB outside Replit.