---
"@maptoolkit/maplibre-scene3d-control": patch
---

A diffed `setStyle` no longer rebuilds the whole scene: when the scene in the new style is the same, the control only puts back the source and native layers the diff dropped and keeps the 3D layers. A diffed `setStyle` that brings a scene, changes it or takes it away now rebuilds or removes it (before, a scene arriving by diff was not built). Handles MapLibre 6, which fires `style.load` after a diffed `setStyle` too. `setScene()` with the same scene again keeps the layers.
