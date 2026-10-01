---
name: Android keyboard touch routing
description: Preserve keyboard behavior while preventing the keyboard controller's Android inset view from taking app touches.
---

When an Android keyboard controller adds a full-window view to receive WindowInsets and keyboard-animation callbacks, make that notification view transparent to touch events rather than disabling the provider. The provider is also used by keyboard-aware inputs and layout components.

**Why:** Disabling the provider can unblock controls underneath its native view, but it also removes provider-backed keyboard handling. A touch-transparent event view addresses the interception without removing keyboard behavior.

**How to apply:** When a screen's controls render but do not receive touches, inspect native sibling overlays first. Keep the keyboard provider active, and verify after dependency upgrades whether the event view still needs a local pass-through patch.