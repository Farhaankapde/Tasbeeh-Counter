---
name: Android keyboard touch routing
description: Preserve keyboard behavior while preventing the keyboard controller's Android inset view from taking app touches.
---

When `react-native-keyboard-controller` adds its full-size Android inset-event view above React content, its default `ReactViewGroup` pointer behavior can consume every touch. Set `pointerEvents = PointerEvents.NONE` on that event-only view rather than disabling the provider. React Native's view then declines the touch and Android's parent dispatch continues to lower siblings. This fixes touch routing, not system Back delivery, which is a separate event path.

**Why:** Disabling the provider can unblock controls underneath its native view, but it also removes provider-backed keyboard handling. The event view needs to receive window-inset and keyboard-animation callbacks without becoming the touch target.

**How to apply:** When a screen's controls render but do not receive touches, inspect native sibling overlays first. Keep the keyboard provider active, make its event-only view decline touches, and verify after dependency upgrades whether the local pass-through patch is still needed. Diagnose Back separately.