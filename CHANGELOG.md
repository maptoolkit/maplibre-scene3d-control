# @maptoolkit/maplibre-scene3d-control

## 0.2.0

### Minor Changes

- 17b8697: `position` can name a style layer: the scene layer goes right below it (e.g. `position: "water_waterway_label_rank_4"`), so a style decides which of its symbol layers draw over the 3D buildings and trees. A layer id the style lacks falls back to under the labels, with a warning.

## 0.1.2

### Patch Changes

- ff58a0e: A scene without buildings (trees only) no longer adds the buildings source, so it costs no TileJSON request and logs no 403 when the app has no key for it.
- ff58a0e: The 3D layers are rebuilt on a real terrain change only (source or exaggeration), not on every `terrain` event: MapLibre fires one for every `setTerrain`, also with the same options, and an app that re-applies its terrain after each style update kept the glTF models loading for good.

## 0.1.1

### Patch Changes

- 022e196: A diffed `setStyle` no longer rebuilds the whole scene: when the scene in the new style is the same, the control only puts back the source and native layers the diff dropped and keeps the 3D layers. A diffed `setStyle` that brings a scene, changes it or takes it away now rebuilds or removes it (before, a scene arriving by diff was not built). Handles MapLibre 6, which fires `style.load` after a diffed `setStyle` too. `setScene()` with the same scene again keeps the layers.

## 0.1.0

### Minor Changes

- 67223b1: First release: `Scene3dControl` builds the 3D scene a Maptoolkit style names in `metadata["maptoolkit:scene3d"]` (3D buildings and glTF vegetation via `@maptoolkit/maplibre-3d-layers`), keeps the tilt in the global state `pitch`, places the layers under the style's labels, rebuilds them after style and terrain changes and loads the 3D library only from `minzoom`.
