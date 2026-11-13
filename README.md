# maplibre-scene3d-control

[![License](https://img.shields.io/npm/l/@maptoolkit/maplibre-scene3d-control?style=plastic)](LICENSE)
[![Version](https://img.shields.io/npm/v/@maptoolkit/maplibre-scene3d-control?style=plastic)](https://www.npmjs.com/package/@maptoolkit/maplibre-scene3d-control)

A [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) control plugin that adds the 3D scene of a Maptoolkit style: 3D buildings, landmarks and glTF vegetation.

Maptoolkit styles name their scene in `metadata["maptoolkit:scene3d"]`. The control reads it whenever the style changes, so switching styles switches the scene. It draws the buildings with a `fill-extrusion` plus [`@maptoolkit/maplibre-3d-layers`](https://www.npmjs.com/package/@maptoolkit/maplibre-3d-layers) (`Fill3DLayer`, `GltfLayer`) and takes care of the rest:

- adds the buildings source with your API key (only for a scene with buildings or landmarks),
- puts the layers under the style's labels,
- keeps the tilt in the global state `pitch`, which the scene's opacity fades read,
- rebuilds the layers after a style or terrain change; a diffed `setStyle` that keeps the scene only puts back what the diff dropped and keeps the 3D layers,
- loads the 3D library (with three.js) only once the map reaches zoom 12.

The 3D library comes with the control: you install and import only the control.

## Install

```bash
npm install @maptoolkit/maplibre-scene3d-control maplibre-gl
```

`@maptoolkit/maplibre-3d-layers` and three.js are dependencies of the control and come along. A bundler puts the 3D library into a file of its own that the control loads on demand.

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
  canvasContextAttributes: { antialias: true }, // smooth edges on the buildings, soft edges on distant trees
});
map.addControl(new Scene3dControl({ apiKey: "YOUR_KEY" }));
```

That is all: the scene of the style appears from zoom 12, and a style switch brings the next style's scene.

### Without a bundler

The package is ESM-only. Load its standalone build, `dist/maplibre-scene3d-control.standalone.js` (also exported as `@maptoolkit/maplibre-scene3d-control/standalone`). Next to it in `dist/` lies the standalone build of maplibre-3d-layers with three.js included, `maplibre-3d-layers-<version>.standalone.mjs`, and the control loads it from there once the map reaches zoom 12. Point `maplibre-gl` at its module build with an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), as for every MapLibre 6 plugin:

```html
<script type="importmap">
  { "imports": { "maplibre-gl": "https://unpkg.com/maplibre-gl@^6.0.0/dist/maplibre-gl.mjs" } }
</script>
<script type="module">
  import * as maplibregl from "maplibre-gl";
  import { Scene3dControl } from "https://unpkg.com/@maptoolkit/maplibre-scene3d-control@^0.3.0/dist/maplibre-scene3d-control.standalone.js";

  const map = new maplibregl.Map({ container: "map", style, center, zoom, pitch: 70, canvasContextAttributes: { antialias: true } });
  map.addControl(new Scene3dControl({ apiKey: "YOUR_KEY" }));
</script>
```

The file name of the bundled library carries its version, so a new release is a new URL and never meets a cached old copy. To self-host, copy both files and keep them side by side.

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
| `library`    | `() => Promise<Scene3dLibrary>`     | the bundled 3D library                        | Loads the 3D library. Default: `import("@maptoolkit/maplibre-3d-layers")`, in the standalone build the copy next to it. Pass a loader to use another build or version.                        |
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
  fill3d: { paint, extrusion },                    // Fill3DLayer on the source layer buildings3d
  landmarks: { position, filter, paint },          // the landmarks in buildings3d, a Fill3DLayer of their own
  models: { tree_1: "https://static.maptoolkit.net/3d/models/…/Tree.gltf" },
  gltf: [{ id, models: ["tree_1"], source: "mtk", "source-layer": "natural", filter, minzoom, layout, paint, lighting }],
}
```

Every part is optional except `version` and `source`. `position` (on `lod1`, `fill3d`, `landmarks` and every `gltf` layer) decides where a layer goes: under the style's labels by default (`"below-labels"`, right below the style's first symbol layer), on top of everything with `"top"`, or right below the style layer whose id it names, e.g. `position: "water_waterway_label_rank_4"`. A layer id the style lacks falls back to under the labels, with a console warning. The position only matters against symbol layers (labels, icons): fills and lines always end up under the 3D layers. Vegetation needs the source it names in the style (`mtk` in Maptoolkit styles); a layer whose source the style lacks is left out with a warning.

`landmarks` draws the landmarks that the buildings tiles carry in the source layer `buildings3d` (features with `source: "landmark"`, each face with its `colour`) as a `Fill3DLayer` of their own, so they can have their own paint and their own place among the style's layers:

```js
landmarks: {
  position: "water_waterway_label_rank_2",
  filter: ["==", ["get", "source"], "landmark"], // the default
  paint: { "fill-3d-color": ["to-color", ["get", "colour"], "#ffffff"], "fill-3d-opacity": 1 },
}
```

`fill3d` then leaves those features out: its filter becomes `["all", <its own filter, if any>, ["!", <the landmarks' filter>]]` (expression filters). A scene without `landmarks` keeps them in `fill3d`, drawn as plain buildings. `landmarks` works without `fill3d` and `lod1` too; the style's own 3D buildings (`hideLayers`) then stay. `paint` goes to the `Fill3DLayer` as it is, on `fill3d` as well, including the `fill-3d-ambient-occlusion-*` keys of maplibre-3d-layers ≥ 0.6 (older versions ignore them, and place a landmark like a building instead of rigidly at its anchor).

`fill3d.extrusion` lets the `Fill3DLayer` extrude the 2D footprints as well (maplibre-3d-layers ≥ 0.6.0, experimental), so that they get the shading and the fake ambient occlusion of the 3D buildings. The control passes it on as it is; hand the same footprints over by the zoom of the tile, so that none is drawn twice:

```js
lod1: { filter: ["all", ["!=", ["get", "extrude"], false], ["<", ["zoom"], 15]], paint },  // native in tiles below z15
fill3d: {
  extrusion: {
    "source-layer": "buildings2d",
    filter: ["all", ["!=", ["get", "extrude"], false], [">=", ["zoom"], 15]],           // three.js from z15
  },
  paint,
},
```

Both filters see the zoom of the tile, not of the map. Don't stop `lod1` with `maxzoom` instead: that is the map zoom, and a pitched view at zoom 15+ still loads z13/z14 tiles in the distance, which then get no buildings from either layer. The extruded faces carry `type: "roof" | "wall"`, so a `fill-3d-color` keyed on `type` colours them like the 3D buildings.

MapLibre ignores a diffed `setStyle` that changes nothing but the metadata. A scene that changes on its own, with the rest of the style unchanged, therefore never reaches the control that way: pass it with `setScene()` or use `setStyle` with `diff: false`.

## Requirements

- **Create the map with `canvasContextAttributes: { antialias: true }`.** MapLibre leaves multisampling off; without it the buildings and trees render with hard, pixelated edges, and the far trees lose their soft leaf edges (alpha to coverage). The control cannot switch it on itself, since the WebGL context exists before the control is added; it warns once in the console when it finds a context without multisampling. Multisampling costs GPU on every frame, which is why MapLibre's default is off.

- MapLibre GL JS ≥ 6 (peer dependency). `@maptoolkit/maplibre-3d-layers` and three.js ≥ 0.160 come with the control.
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

Releases go through changesets: a merge to `main` with a changeset opens "Version Packages", and merging that publishes. A release of `@maptoolkit/maplibre-3d-layers` needs no hand: [`bump-maptoolkit-packages.yml`](.github/workflows/bump-maptoolkit-packages.yml) opens a PR that raises the bundled version and versions the control in one go (same bump level as the library), merges it once CI is green, and the merge publishes the control and notifies its consumers.

## License

BSD-3-Clause
