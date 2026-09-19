---
name: Free image cleanup
description: A fallback for making generated raster assets transparent when the managed background-removal helper is unavailable.
---

The managed image-background removal helper may be unavailable in the free workspace mode. For generated assets with a light checkerboard background, a local ImageMagick alpha flood-fill can remove the connected background while preserving the darker product subject.

**Why:** Transparent product cutouts are useful for compositing in mobile previews, but the managed helper is not always available.

**How to apply:** Inspect corner and subject pixels first, use conservative low-fuzz flood fills seeded along exposed image edges, verify the output has an `srgba` channel and transparent corners, then visually inspect for checkerboard remnants and artwork loss. Avoid a broad high-fuzz fill because it can erase light marble or gold detail.