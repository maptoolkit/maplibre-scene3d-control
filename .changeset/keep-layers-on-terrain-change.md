---
"@maptoolkit/maplibre-scene3d-control": patch
---

The 3D layers stay when the terrain is switched on, off or changed (another source, another exaggeration): the buildings and trees no longer disappear and load again, they move onto the new heights. `@maptoolkit/maplibre-3d-layers` 0.7.0 does that itself; the control used to remove and add the layers for it.
