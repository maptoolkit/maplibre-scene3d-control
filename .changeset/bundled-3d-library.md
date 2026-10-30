---
"@maptoolkit/maplibre-scene3d-control": minor
---

The 3D library comes with the control. `@maptoolkit/maplibre-3d-layers` and three.js are dependencies now instead of peer dependencies, so `npm install @maptoolkit/maplibre-scene3d-control maplibre-gl` is all an app installs. Without a bundler, load the new standalone build `dist/maplibre-scene3d-control.standalone.js` (export `./standalone`): it loads the bundled `maplibre-3d-layers-<version>.standalone.mjs` next to it, so no `library` option is needed. Existing setups that pass `library` keep working.
