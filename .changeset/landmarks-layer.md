---
"@maptoolkit/maplibre-scene3d-control": minor
---

Landmarks as a layer of their own: a scene's new `landmarks` entry (`position`, `filter`, `paint`) draws the landmarks in the buildings tiles (source layer `buildings3d`, features with `source: "landmark"`) with a second `Fill3DLayer`, with its own paint and its own place among the style's layers. `fill3d` then leaves those features out. A scene without the entry is drawn as before.
