---
name: Expo web state checks
description: A practical constraint when validating state-dependent Expo UI in the browser preview.
---

The Expo web preview can retain AsyncStorage between workflow restarts, so a fresh default state may not appear during visual checks.

**Why:** Reloading or restarting the workflow does not necessarily clear the browser’s persisted app state, which can make a temporary seeded state appear ineffective or make an empty state persist unexpectedly.

**How to apply:** For a visual check that requires populated state, use a temporary preview-only storage key, verify the screen, then restore the production key and default state before finishing.

When an Expo UI test mocks AsyncStorage with mutable state, restore the fixture in a `finally` block.

**Why:** A failed assertion can otherwise leak the temporary state into later tests and make unrelated screens appear broken.

**How to apply:** Keep the mocked storage value scoped to the test flow and always restore the baseline fixture, including when setup or assertions fail.