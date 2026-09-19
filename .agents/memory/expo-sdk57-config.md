---
name: Expo SDK 57 configuration
description: SDK 57 validates splash settings through the expo-splash-screen config plugin rather than the legacy top-level splash field.
---

Use the expo-splash-screen config plugin for explicit splash assets in this project’s Expo SDK 57 configuration.

**Why:** Expo Doctor rejects the legacy top-level splash field against the SDK 57 app-config schema.

**How to apply:** Keep the existing font-loading gate in the root layout and configure image, size, resize mode, and background through the plugin entry.