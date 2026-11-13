---
"@maptoolkit/maplibre-scene3d-control": patch
---

Scene format: `fill3d.extrusion` is part of the scene's type and documented. It lets the `Fill3DLayer` extrude the 2D footprints too (maplibre-3d-layers ≥ 0.6.0), so that the OSM buildings without a roof shape get the shading and the fake ambient occlusion of the 3D buildings; `lod1` hands them over by zoom. The control already passed the entry on unchanged, so scenes that carry it work with 0.5.0 as well.
