# maplibre-scene3d-control

[![License](https://img.shields.io/npm/l/@maptoolkit/maplibre-scene3d-control?style=plastic)](LICENSE)
[![Version](https://img.shields.io/npm/v/@maptoolkit/maplibre-scene3d-control?style=plastic)](https://www.npmjs.com/package/@maptoolkit/maplibre-scene3d-control)

A [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) control plugin that adds the 3D scene of a Maptoolkit style: 3D buildings and glTF vegetation.

Maptoolkit styles name their scene in `metadata["maptoolkit:scene3d"]`. The control reads it whenever the style changes, so switching styles switches the scene. It draws the buildings with a `fill-extrusion` plus [`@maptoolkit/maplibre-3d-layers`](https://www.npmjs.com/package/@maptoolkit/maplibre-3d-layers) (`Fill3DLayer`, `GltfLayer`) and takes care of the rest:

- adds the buildings source with your API key (only for a scene with buildings),
- puts the layers under the style's labels,
- keeps the tilt in the global state `pitch`, which the scene's opacity fades read,
- rebuilds the layers after a style or terrain change; a diffed `setStyle` that keeps the scene only puts back what the diff dropped and keeps the 3D layers,
- loads the 3D library (with three.js) only once the map reaches zoom 12.

## Install

```bash
npm install @maptoolkit/maplibre-scene3d-control @maptoolkit/maplibre-3d-layers three maplibre-gl
```

## Usage

```js
import * as maplibregl from "maplibre-gl";
import { Scene3dControl } from "@maptoolkit/maplibre-scene3d-control";
import "@maptoolkit/maplibre-scene3d-control/style.css";

const map = new maplibregl.Map({
  container: "map",
  style: "https://styles.maptoolkit.net/maptoolkit/maptoolkit.summer.json?api_key=YOUR_KEY",
  center: [16.359, 48.21],
  zoom: 16,
  pitch: 70,
  maxPitch: 85,
  canvasContextAttributes: { antialias: true }, // soft edges on distant trees
});
map.addControl(new Scene3dControl({ apiKey: "YOUR_KEY" }));
```

That is all: the scene of the style appears from zoom 12, and a style switch brings the next style's scene.

### Without a bundler

The package is ESM-only. With an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), point `maplibre-gl` at its module build and let the control load the standalone build of maplibre-3d-layers, which includes three.js:

```html
<script type="importmap">
  { "imports": { "maplibre-gl": "https://unpkg.com/maplibre-gl@^6.0.0/dist/maplibre-gl.mjs" } }
</script>
<script type="module">
  import * as maplibregl from "maplibre-gl";
  import { Scene3dControl } from "https://unpkg.com/@maptoolkit/maplibre-scene3d-control@^0.1.0/dist/maplibre-scene3d-control.js";

  const map = new maplibregl.Map({ container: "map", style, center, zoom, pitch: 70, canvasContextAttributes: { antialias: true } });
  map.addControl(
    new Scene3dControl({
      apiKey: "YOUR_KEY",
      library: () => import("https://unpkg.com/@maptoolkit/maplibre-3d-layers@^0.5.1/dist/maplibre-3d-layers.standalone.mjs"),
    }),
  );
</script>
```

## Options

| Option       | Type                                | Default                                       | Description                                                                                                                                                                                   |
| ------------ | ----------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`     | `string`                            | —                                             | Maptoolkit API key, added to the buildings source URL as `api_key`. Without it the buildings source answers 403.                                                                              |
| `scene`      | `Scene3dManifest \| string \| null` | the style's                                   | A scene (or its URL) to show instead of the style's own; `null` shows none.                                                                                                                   |
| `enabled`    | `boolean`                           | `true`                                        | Show the scene right away.                                                                                                                                                                    |
| `button`     | `boolean`                           | `false`                                       | Add a 3D button that switches the scene on and off. Without it the control has no UI.                                                                                                         |
| `minzoom`    | `number`                            | `12`                                          | Zoom from which the 3D library is loaded. The buildings source has no tiles below 12.                                                                                                         |
| `hideLayers` | `string[]`                          | `["building_3d", "building_3d_multicolored"]` | Style layers hidden while the scene's buildings are shown, e.g. a style's own 3D buildings. Hidden only once the buildings source has loaded: without a working API key the style keeps them. |
| `modelBase`  | `string`                            | document base URL                             | Base for relative model URLs.                                                                                                                                                                 |
| `library`    | `() => Promise<Scene3dLibrary>`     | `import("@maptoolkit/maplibre-3d-layers")`    | Loads the 3D library, e.g. from a CDN.                                                                                                                                                        |
| `idPrefix`   | `string`                            | `"scene3d-"`                                  | Prefix of the source and layer ids the control adds.                                                                                                                                          |

## Methods

| Method                           | Description                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `setScene(scene)`                | Show another scene: a manifest, its URL, `null` for none, or `undefined` to go back to the style's own. The same scene again keeps the layers. |
| `getScene()`                     | The scene shown now, or `null`.                                                                                                                |
| `setEnabled(on)` / `isEnabled()` | Switch the scene on or off.                                                                                                                    |
| `getLayers()`                    | The maplibre-3d-layers layers on the map, e.g. to drive them frame by frame.                                                                   |
| `loadLibrary()` / `getLibrary()` | Load the 3D library now instead of at `minzoom`; the loaded library.                                                                           |

## Events

```js
control.on("scene.change", (ev) => console.log(ev.scene)); // built, rebuilt or removed
```

## The scene (`metadata["maptoolkit:scene3d"]`, version 1)

All values are plain MapLibre or maplibre-3d-layers options. Maptoolkit styles get it from [style-family-js](https://github.com/maptoolkit/style-family-js).

```js
{
  version: 1,
  source: "https://…/buildings.json",              // TileJSON of the buildings, without api_key
  lod1: { filter, paint, layout },                 // fill-extrusion on the source layer buildings2d
  fill3d: { paint },                               // Fill3DLayer on the source layer buildings3d
  models: { tree_1: "https://static.maptoolkit.net/3d/models/…/Tree.gltf" },
  gltf: [{ id, models: ["tree_1"], source: "mtk", "source-layer": "natural", filter, minzoom, layout, paint, lighting }],
}
```

Every part is optional except `version` and `source`. A layer goes under the style's labels unless it says `position: "top"`. Vegetation needs the source it names in the style (`mtk` in Maptoolkit styles); a layer whose source the style lacks is left out with a warning.

MapLibre ignores a diffed `setStyle` that changes nothing but the metadata. A scene that changes on its own, with the rest of the style unchanged, therefore never reaches the control that way: pass it with `setScene()` or use `setStyle` with `diff: false`.

## Requirements

- MapLibre GL JS ≥ 6, `@maptoolkit/maplibre-3d-layers` ≥ 0.5.1 and three.js ≥ 0.160 (peer dependencies of the 3D library).
- A Maptoolkit API key with access to the buildings source.
- A style with a scene, or a scene passed with `scene`. Vegetation also needs the style's `mtk` source.

## Styling

```css
.maplibre-scene3d-control {
  --scene3d-control-color: #333;
  --scene3d-control-color-active: #0074d9;
}
```

## Development

```bash
npm install
npm run dev        # demo on http://localhost:5173 (demo/index.html, scene in demo/public/scene.json)
npm test
npm run lint
npm run typecheck
npm run build
```

## License

BSD-3-Clause
