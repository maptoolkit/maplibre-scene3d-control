# @maptoolkit/maplibre-scene3d-control

## 0.1.0

### Minor Changes

- 67223b1: First release: `Scene3dControl` builds the 3D scene a Maptoolkit style names in `metadata["maptoolkit:scene3d"]` (3D buildings and glTF vegetation via `@maptoolkit/maplibre-3d-layers`), keeps the tilt in the global state `pitch`, places the layers under the style's labels, rebuilds them after style and terrain changes and loads the 3D library only from `minzoom`.
