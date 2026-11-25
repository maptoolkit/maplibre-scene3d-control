# @maptoolkit/maplibre-scene3d-control

## 0.9.0

### Minor Changes

- 1fdf606: Style layers named by the scene: `building_extruded`, `building_3d` and `landmarks_3d` can carry `style_layers`, a list of groups `{ layers, layout?, paint? }`, one value for several style layers. The control sets them once the buildings source has loaded, sets them again after a diffed `setStyle`, and puts the style's own values back when the scene goes. style-family-js 2.9.0 hides the style's own 3D buildings that way and fades the labels inside a landmark as the map tilts (an expression with `["global-state", "pitch"]`, which must not sit in the style layers themselves: older renderers reject it).

  **Breaking:** the option `hideLayers` and its fixed list of layer ids are gone; a scene names the layers to hide in `style_layers`. `style_layers` is not passed on to the layers the control adds.

## 0.8.0

### Minor Changes

- 69826dc: New names for the building entries of a scene: `lod1` is now `building_extruded`, `fill3d` is `building_3d` and `landmarks` is `landmarks_3d` (style-family-js 2.7.0). The control still reads a scene with the old names, as the new ones; where a scene has both, the new name wins. Its layers on the map follow the new names: `scene3d-building_extruded`, `scene3d-building_3d`, `scene3d-landmarks_3d` (were `scene3d-lod1`, `scene3d-fill3d`, `scene3d-landmarks`). `getScene()` and the `scene.change` event give the scene with the new names.

  `hideLayers` now also hides the style's own 3D buildings under their new ids, `building_extruded` and `building_extruded_multicolored`, as well as `building_3d` and `building_3d_multicolored`.

## 0.7.0

### Minor Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.8.0.

## 0.6.1

### Patch Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.7.1.

## 0.6.0

### Minor Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.7.0.

### Patch Changes

- ab39c09: The 3D layers stay when the terrain is switched on, off or changed (another source, another exaggeration): the buildings and trees no longer disappear and load again, they move onto the new heights. `@maptoolkit/maplibre-3d-layers` 0.7.0 does that itself; the control used to remove and add the layers for it.

## 0.5.2

### Patch Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.6.1.

## 0.5.1

### Patch Changes

- f11229a: Scene format: `fill3d.extrusion` is part of the scene's type and documented. It lets the `Fill3DLayer` extrude the 2D footprints too (maplibre-3d-layers ≥ 0.6.0), so that the OSM buildings without a roof shape get the shading and the fake ambient occlusion of the 3D buildings; `lod1` hands them over by zoom. The control already passed the entry on unchanged, so scenes that carry it work with 0.5.0 as well.

## 0.5.0

### Minor Changes

- af1f657: Landmarks as a layer of their own: a scene's new `landmarks` entry (`position`, `filter`, `paint`) draws the landmarks in the buildings tiles (source layer `buildings3d`, features with `source: "landmark"`) with a second `Fill3DLayer`, with its own paint and its own place among the style's layers. `fill3d` then leaves those features out. A scene without the entry is drawn as before.

## 0.4.0

### Minor Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.6.0.

## 0.3.3

### Patch Changes

- 2863f86: Warn once in the console when the map's WebGL context has no multisampling (`canvasContextAttributes: { antialias: true }`): without it the buildings and trees render with pixelated edges, and the control cannot switch it on itself.

## 0.3.2

### Patch Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.5.6.

## 0.3.1

### Patch Changes

- Bundles @maptoolkit/maplibre-3d-layers 0.5.5.

## 0.3.0

### Minor Changes

- a4beb5c: The 3D library comes with the control. `@maptoolkit/maplibre-3d-layers` and three.js are dependencies now instead of peer dependencies, so `npm install @maptoolkit/maplibre-scene3d-control maplibre-gl` is all an app installs. Without a bundler, load the new standalone build `dist/maplibre-scene3d-control.standalone.js` (export `./standalone`): it loads the bundled `maplibre-3d-layers-<version>.standalone.mjs` next to it, so no `library` option is needed. Existing setups that pass `library` keep working.

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
