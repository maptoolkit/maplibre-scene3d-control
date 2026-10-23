---
"@maptoolkit/maplibre-scene3d-control": minor
---

`position` can name a style layer: the scene layer goes right below it (e.g. `position: "water_waterway_label_rank_4"`), so a style decides which of its symbol layers draw over the 3D buildings and trees. A layer id the style lacks falls back to under the labels, with a warning.
