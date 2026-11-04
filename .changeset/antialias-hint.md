---
"@maptoolkit/maplibre-scene3d-control": patch
---

Warn once in the console when the map's WebGL context has no multisampling (`canvasContextAttributes: { antialias: true }`): without it the buildings and trees render with pixelated edges, and the control cannot switch it on itself.
