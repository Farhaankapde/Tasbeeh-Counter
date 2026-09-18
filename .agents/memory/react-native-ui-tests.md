---
name: React Native UI tests
description: Constraints for running Expo React Native screen tests in this workspace's Node test runner.
---

Use the pure React Native Testing Library entry with Node's experimental module mocks for screen-level tests. Mock native runtime modules and static assets because the full React Native package contains Flow syntax and Expo assets are not Node modules.

**Why:** The Expo app uses a Node-based test command rather than Jest, so importing the production native runtime directly fails before the screen can render.

**How to apply:** Keep these mocks local to the UI test and query the same accessibility labels and test IDs exposed by the screen.