---
"@maptoolkit/maplibre-scene3d-control": minor
---

Style layers named by the scene: `building_extruded`, `building_3d` and `landmarks_3d` can carry `style_layers`, a list of groups `{ layers, layout?, paint? }`, one value for several style layers. The control sets them once the buildings source has loaded, sets them again after a diffed `setStyle`, and puts the style's own values back when the scene goes. style-family-js 2.9.0 hides the style's own 3D buildings that way and fades the labels inside a landmark as the map tilts (an expression with `["global-state", "pitch"]`, which must not sit in the style layers themselves: older renderers reject it).

**Breaking:** the option `hideLayers` and its fixed list of layer ids are gone; a scene names the layers to hide in `style_layers`. `style_layers` is not passed on to the layers the control adds.
