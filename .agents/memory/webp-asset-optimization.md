---
name: WebP asset optimization
description: Production WebP assets require both runtime MIME support and Node test-loader support.
---

Use WebP for large Expo image assets when preserving dimensions and alpha is important. Keep the standalone static server's `image/webp` MIME mapping and register `.webp` in Node-based asset mocks used by UI tests.

**Why:** Metro and Expo can bundle WebP, but the standalone server needs an explicit MIME type and the Node test runner otherwise tries to parse binary WebP files as JavaScript.

**How to apply:** When adding or converting an Expo image to WebP, update the asset import, server MIME map, and test asset extension mock together.