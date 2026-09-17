---
name: Expo preview environment
description: Non-blocking Expo workflow warning observed in this workspace.
---

The Expo preview can start successfully while React Native DevTools logs a missing `libglib-2.0.so.0` warning in the container. Treat the Metro QR/web URL and workflow status as the source of truth for app availability.

**Why:** The missing library affects the optional DevTools helper, not the Expo bundle or preview server.

**How to apply:** Do not change app code or workflow configuration solely because this warning appears; investigate only if Metro itself fails to serve the app.