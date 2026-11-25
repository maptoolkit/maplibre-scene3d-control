---
"@maptoolkit/maplibre-scene3d-control": minor
---

New names for the building entries of a scene: `lod1` is now `building_extruded`, `fill3d` is `building_3d` and `landmarks` is `landmarks_3d` (style-family-js 2.7.0). The control still reads a scene with the old names, as the new ones; where a scene has both, the new name wins. Its layers on the map follow the new names: `scene3d-building_extruded`, `scene3d-building_3d`, `scene3d-landmarks_3d` (were `scene3d-lod1`, `scene3d-fill3d`, `scene3d-landmarks`). `getScene()` and the `scene.change` event give the scene with the new names.

`hideLayers` now also hides the style's own 3D buildings under their new ids, `building_extruded` and `building_extruded_multicolored`, as well as `building_3d` and `building_3d_multicolored`.
