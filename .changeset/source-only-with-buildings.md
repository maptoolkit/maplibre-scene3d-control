---
"@maptoolkit/maplibre-scene3d-control": patch
---

A scene without buildings (trees only) no longer adds the buildings source, so it costs no TileJSON request and logs no 403 when the app has no key for it.
