// The standalone build: the control together with the 3D library it was built against, which lies next to it in
// dist/. A page without a bundler imports only this file (plus an import map for "maplibre-gl", like every MapLibre 6
// plugin) and passes no `library`. The library is fetched relative to this file once the map reaches `minzoom`; its
// file name carries its version, so a new release is a new URL for every cache.
import { Scene3dControl as BaseControl, type Scene3dControlOptions, type Scene3dLibrary } from "./Scene3dControl";

/**
 * Loads the standalone build of maplibre-3d-layers (three.js included) that ships next to this file. A concatenated
 * string, not a template literal: Vite turns `new URL(\`./${...}\`, import.meta.url)` into a glob over src/.
 */
export const bundledLibrary = (): Promise<Scene3dLibrary> =>
  import(/* @vite-ignore */ new URL("./" + __BUNDLED_LIBRARY__, import.meta.url).href) as Promise<Scene3dLibrary>;

/** The control, loading the bundled 3D library unless `library` names another one. */
export class Scene3dControl extends BaseControl {
  constructor(options: Scene3dControlOptions = {}) {
    super({ ...options, library: options.library ?? bundledLibrary });
  }
}

export { SCENE3D_METADATA_KEY } from "./Scene3dControl";
export type { Scene3dControlOptions, Scene3dManifest, Scene3dGltfLayer, Scene3dLibrary, Scene3dPosition, Scene3dControlEventType } from "./Scene3dControl";
