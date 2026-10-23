---
"@maptoolkit/maplibre-scene3d-control": patch
---

The 3D layers are rebuilt on a real terrain change only (source or exaggeration), not on every `terrain` event: MapLibre fires one for every `setTerrain`, also with the same options, and an app that re-applies its terrain after each style update kept the glTF models loading for good.
