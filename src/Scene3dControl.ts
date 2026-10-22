import { Evented } from "maplibre-gl";
import type { ControlPosition, CustomLayerInterface, FilterSpecification, IControl, Map as MaplibreMap, MapLibreEvent, MapSourceDataEvent } from "maplibre-gl";

/** Root metadata key under which a Maptoolkit style carries its 3D scene. */
export const SCENE3D_METADATA_KEY = "maptoolkit:scene3d";

/** Where a layer of the scene goes: under the style's labels (default) or on top of everything. */
export type Scene3dPosition = "below-labels" | "top";

type Expression = unknown;

/** One glTF vegetation layer: maplibre-3d-layers `GltfLayer` options, `models` as ids of the scene's model library. */
export interface Scene3dGltfLayer {
  id: string;
  position?: Scene3dPosition;
  /** Model ids from {@link Scene3dManifest.models}; all of them when missing. */
  models?: string[];
  source: string;
  "source-layer"?: string;
  filter?: FilterSpecification;
  minzoom?: number;
  maxzoom?: number;
  layout?: Record<string, Expression>;
  paint?: Record<string, Expression>;
  lighting?: { ambient?: number; directional?: number; environment?: number };
  maxInstances?: number;
  doubleSided?: boolean;
}

/** The 3D scene of a style, `metadata["maptoolkit:scene3d"]` (version 1). Values are plain MapLibre / maplibre-3d-layers options. */
export interface Scene3dManifest {
  version: 1;
  /** TileJSON URL of the buildings source, without api_key. */
  source: string;
  /** `fill-extrusion` on the source layer `buildings2d`. */
  lod1?: {
    position?: Scene3dPosition;
    minzoom?: number;
    maxzoom?: number;
    filter?: FilterSpecification;
    paint?: Record<string, Expression>;
    layout?: Record<string, Expression>;
  };
  /** `Fill3DLayer` on the source layer `buildings3d`. */
  fill3d?: { position?: Scene3dPosition; filter?: FilterSpecification; paint?: Record<string, Expression> };
  /** Model library of the vegetation: id → glTF/glb URL. */
  models?: Record<string, string>;
  gltf?: Scene3dGltfLayer[];
}

/** What the control needs from `@maptoolkit/maplibre-3d-layers`. */
export interface Scene3dLibrary {
  Fill3DLayer: new (options: Record<string, unknown>) => CustomLayerInterface;
  GltfLayer: new (options: Record<string, unknown>) => CustomLayerInterface;
}

export interface Scene3dControlOptions {
  /** Maptoolkit API key, added to the buildings source URL as `api_key`. */
  apiKey?: string;
  /**
   * The scene to show. Left out: the one the current style names in `metadata["maptoolkit:scene3d"]`,
   * re-read on every style change. A manifest or its URL replaces it; `null` shows none.
   */
  scene?: Scene3dManifest | string | null;
  /** Show the scene right away (default `true`). */
  enabled?: boolean;
  /** Add a 3D button that switches the scene on and off (default `false`: the control has no UI). */
  button?: boolean;
  /** The 3D library is loaded once the map reaches this zoom; the buildings source has no tiles below 12 (default `12`). */
  minzoom?: number;
  /**
   * Style layers hidden while the scene's buildings are shown, e.g. a style's own 3D buildings (default the v2 ids
   * `building_3d`, `building_3d_multicolored`). Hidden only once the buildings source has loaded, so without a working
   * API key the style keeps them.
   */
  hideLayers?: string[];
  /** Base for relative model URLs (default the document's base URL). */
  modelBase?: string;
  /** Loads `@maptoolkit/maplibre-3d-layers` (default a dynamic import of the package). Pass another loader for its standalone build or a CDN. */
  library?: () => Promise<Scene3dLibrary>;
  /** Prefix of the source and layer ids the control adds (default `"scene3d-"`). */
  idPrefix?: string;
}

/** Fired via `control.on("scene.change", ...)` whenever the shown scene is (re)built or removed. */
export type Scene3dControlEventType = {
  "scene.change": MapLibreEvent<"scene.change"> & { scene: Scene3dManifest | null };
};

type ResolvedOptions = Required<Omit<Scene3dControlOptions, "apiKey" | "scene" | "modelBase">> & Pick<Scene3dControlOptions, "apiKey" | "modelBase">;

const DEFAULTS: Omit<ResolvedOptions, "library"> = {
  enabled: true,
  button: false,
  minzoom: 12,
  hideLayers: ["building_3d", "building_3d_multicolored"],
  idPrefix: "scene3d-",
};

const CUBE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.7 8 12 11.7 5.3 8 12 4.3ZM5 9.7l6 3.3v6.7l-6-3.4V9.7Zm8 10V13l6-3.3v6.6l-6 3.4Z"/></svg>';

// MapLibre's Style is private API; the control only reads whether it has loaded and its identity.
type StyleHandle = { _loaded?: boolean } | undefined;
const styleOf = (map: MaplibreMap) => (map as unknown as { style?: StyleHandle }).style;

/**
 * A MapLibre GL JS control plugin that adds the 3D scene of a Maptoolkit style: 3D buildings
 * (a `fill-extrusion` plus maplibre-3d-layers' `Fill3DLayer`) and glTF vegetation (`GltfLayer`).
 *
 * The scene comes from the style itself (`metadata["maptoolkit:scene3d"]`, written by style-family-js),
 * so a style switch brings its own scene. The control keeps the tilt in the global state `pitch`
 * that the scene's opacity fades read, puts the layers under the style's labels, rebuilds them after
 * style and terrain changes and loads the 3D library only when the map gets close enough.
 */
export class Scene3dControl extends Evented<Scene3dControlEventType> implements IControl {
  readonly options: ResolvedOptions;

  private map?: MaplibreMap;
  private container?: HTMLElement;
  private button?: HTMLButtonElement;
  private enabled: boolean;
  /** undefined: the style's own scene. */
  private override: Scene3dManifest | null | undefined;
  private scene: Scene3dManifest | null = null;
  private lib?: Scene3dLibrary;
  private libPromise?: Promise<Scene3dLibrary>;
  private custom: CustomLayerInterface[] = [];
  private native: string[] = [];
  private hidden = new Map<string, "visible" | "none">();
  private loadedStyle: StyleHandle = undefined;
  private pitch: number | null = null;
  private building = false;
  private generation = 0;
  private warned = new Set<string>();
  /** Stops waiting for the buildings source (see hideOnceBuildingsLoad). */
  private stopWaiting?: () => void;

  constructor(options: Scene3dControlOptions = {}) {
    super();
    const { scene, ...rest } = options;
    this.options = {
      ...DEFAULTS,
      library: () => import("@maptoolkit/maplibre-3d-layers") as unknown as Promise<Scene3dLibrary>,
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    } as ResolvedOptions;
    this.enabled = this.options.enabled;
    if (scene !== undefined) void this.setScene(scene);
  }

  getDefaultPosition(): ControlPosition {
    return "top-right";
  }

  onAdd(map: MaplibreMap): HTMLElement {
    this.map = map;
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group maplibre-scene3d-control";
    if (this.options.button) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "maplibre-scene3d-control-toggle";
      button.title = "3D";
      button.setAttribute("aria-label", "3D");
      button.innerHTML = CUBE_ICON;
      button.addEventListener("click", () => this.setEnabled(!this.enabled));
      container.appendChild(button);
      this.button = button;
      this.showState();
    } else {
      container.classList.add("maplibre-scene3d-control-hidden");
    }
    this.container = container;

    map.on("style.load", this.onStyleLoad);
    map.on("styledata", this.onStyleData);
    map.on("terrain", this.onTerrain);
    map.on("pitch", this.syncPitch);
    map.on("zoomend", this.onZoom);
    // Added to a map whose style has already loaded: no style.load will come for it.
    if (styleOf(map)?._loaded) this.onStyleLoad();
    return container;
  }

  onRemove(): void {
    const map = this.map;
    if (!map) return;
    this.teardown(true);
    map.off("style.load", this.onStyleLoad);
    map.off("styledata", this.onStyleData);
    map.off("terrain", this.onTerrain);
    map.off("pitch", this.syncPitch);
    map.off("zoomend", this.onZoom);
    this.container?.remove();
    this.container = this.button = undefined;
    this.map = undefined;
    this.loadedStyle = undefined;
  }

  /**
   * Replace the style's scene: a manifest, the URL of one, `null` for none, or `undefined` to go back
   * to the style's own scene.
   */
  async setScene(scene: Scene3dManifest | string | null | undefined): Promise<void> {
    if (typeof scene === "string") {
      const response = await fetch(new URL(scene, document.baseURI).href);
      if (!response.ok) throw new Error(`Scene ${scene}: HTTP ${response.status}`);
      scene = (await response.json()) as Scene3dManifest;
    }
    this.override = scene;
    this.refresh();
  }

  /** The scene shown now, or null. */
  getScene(): Scene3dManifest | null {
    return this.scene;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.showState();
    this.refresh();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** The maplibre-3d-layers layers on the map (`Fill3DLayer`, `GltfLayer`s), e.g. to drive them frame by frame. */
  getLayers(): CustomLayerInterface[] {
    return [...this.custom];
  }

  /** The 3D library, once loaded. */
  getLibrary(): Scene3dLibrary | undefined {
    return this.lib;
  }

  /** Load the 3D library now instead of waiting for `minzoom`. */
  loadLibrary(): Promise<Scene3dLibrary> {
    this.libPromise ??= this.options.library().then(
      (lib) => (this.lib = lib),
      (err) => {
        this.libPromise = undefined;
        throw err;
      },
    );
    return this.libPromise;
  }

  // ---------------------------------------------------------------- map events

  private onStyleLoad = () => {
    if (!this.map) return;
    this.loadedStyle = styleOf(this.map);
    this.pitch = null; // a new style starts with its own global state
    this.teardown(false); // whatever of the old scene a style diff left behind
    this.refresh();
  };

  // A style switch with diff (setStyle without { diff: false }) keeps the Style object, fires no
  // style.load and drops our layers as "not in the new style": rebuild from the new style.
  private onStyleData = () => {
    if (this.building || !this.map || !this.styleReady() || !this.scene) return;
    const ids = [...this.native, ...this.custom.map((l) => l.id)];
    if (ids.some((id) => !this.map!.getLayer(id))) this.refresh();
  };

  // The 3D layers take the terrain as it is when they are added.
  private onTerrain = () => {
    if (!this.map || !this.styleReady() || !this.custom.length || !this.scene) return;
    this.removeCustom();
    this.addCustom(this.scene, this.generation);
  };

  private onZoom = () => {
    if (!this.map || this.lib || !this.scene || this.map.getZoom() < this.options.minzoom) return;
    this.loadCustom(this.scene, this.generation);
  };

  /** `["global-state", "pitch"]` for the scene's opacity fades. Whole degrees: each change is a style update. */
  private syncPitch = () => {
    if (!this.map || !this.styleReady()) return;
    const pitch = Math.round(this.map.getPitch());
    if (pitch === this.pitch) return;
    this.pitch = pitch;
    this.map.setGlobalStateProperty("pitch", pitch);
  };

  // ---------------------------------------------------------------- building

  private styleReady(): boolean {
    return !!this.map && !!this.loadedStyle && styleOf(this.map) === this.loadedStyle;
  }

  private currentScene(): Scene3dManifest | null {
    if (!this.enabled) return null;
    if (this.override !== undefined) return this.override;
    const scene = this.map?.getStyle()?.metadata as Record<string, unknown> | undefined;
    return (scene?.[SCENE3D_METADATA_KEY] as Scene3dManifest | undefined) ?? null;
  }

  private refresh() {
    const map = this.map;
    if (!map || !this.styleReady()) return;
    this.building = true;
    try {
      this.teardown(true);
      const generation = ++this.generation;
      let scene = this.currentScene();
      if (scene && scene.version !== 1) {
        this.warnOnce(`version-${String(scene.version)}`, `Scene3dControl: unsupported scene version ${String(scene.version)}`);
        scene = null;
      }
      this.scene = scene;
      if (scene) {
        this.syncPitch();
        if (scene.lod1 || scene.fill3d) this.hideOnceBuildingsLoad(generation);
        this.addNative(scene);
        if (this.lib) this.addCustom(scene, generation);
        else if (map.getZoom() >= this.options.minzoom) this.loadCustom(scene, generation);
      }
    } finally {
      this.building = false;
    }
    this.fire("scene.change", { scene: this.scene });
  }

  private sourceId() {
    return `${this.options.idPrefix}buildings`;
  }

  /** The id of the style's first symbol layer: the scene goes right below it. */
  private labelsAnchor(): string | undefined {
    return this.map?.getStyle().layers.find((l) => l.type === "symbol" && !l.id.startsWith(this.options.idPrefix))?.id;
  }

  private beforeFor(position: Scene3dPosition | undefined, anchor: string | undefined) {
    return position === "top" ? undefined : anchor;
  }

  private addNative(scene: Scene3dManifest) {
    const map = this.map!;
    const source = this.sourceId();
    if (!map.getSource(source)) map.addSource(source, { type: "vector", url: this.withKey(scene.source) });
    const anchor = this.labelsAnchor();
    const p = this.options.idPrefix;
    if (scene.lod1) {
      const { position, ...lod1 } = scene.lod1;
      map.addLayer({ id: `${p}lod1`, type: "fill-extrusion", source, "source-layer": "buildings2d", ...lod1 } as never, this.beforeFor(position, anchor));
      this.native.push(`${p}lod1`);
    } else if (scene.fill3d) {
      // The Fill3DLayer reads tiles MapLibre only loads for a source a style layer uses.
      map.addLayer(
        { id: `${p}consumer`, type: "fill", source, "source-layer": "buildings2d", filter: ["boolean", false], paint: { "fill-opacity": 0 } },
        this.beforeFor(scene.fill3d.position, anchor),
      );
      this.native.push(`${p}consumer`);
    }
  }

  private loadCustom(scene: Scene3dManifest, generation: number) {
    this.loadLibrary().then(
      () => {
        if (generation === this.generation && this.scene === scene && !this.custom.length) this.addCustom(scene, generation);
      },
      (err) => console.error("Scene3dControl: could not load @maptoolkit/maplibre-3d-layers", err),
    );
  }

  private addCustom(scene: Scene3dManifest, generation: number) {
    const map = this.map;
    const lib = this.lib;
    if (!map || !lib || generation !== this.generation || !this.styleReady()) return;
    const anchor = this.labelsAnchor();
    const p = this.options.idPrefix;
    const add = (layer: CustomLayerInterface, position: Scene3dPosition | undefined) => {
      map.addLayer(layer, this.beforeFor(position, anchor));
      this.custom.push(layer);
    };
    this.building = true;
    try {
      if (scene.fill3d) {
        const { position, ...fill3d } = scene.fill3d;
        add(new lib.Fill3DLayer({ id: `${p}fill3d`, source: this.sourceId(), "source-layer": "buildings3d", ...fill3d }), position);
      }
      const library = scene.models ?? {};
      for (const entry of scene.gltf ?? []) {
        const { id, position, models: ids, ...options } = entry;
        if (!map.getSource(options.source)) {
          this.warnOnce(`source-${options.source}`, `Scene3dControl: the style has no source "${options.source}", layer "${id}" left out`);
          continue;
        }
        const picked = ids ?? Object.keys(library);
        const models = Object.fromEntries(picked.filter((m) => library[m]).map((m) => [m, this.modelUrl(library[m])]));
        if (!Object.keys(models).length) continue;
        add(new lib.GltfLayer({ id: `${p}${id}`, models, ...options }), position);
      }
    } finally {
      this.building = false;
    }
  }

  private removeCustom() {
    const map = this.map;
    for (const layer of this.custom) {
      if (map?.getLayer(layer.id)) map.removeLayer(layer.id);
      // A replaced style never calls onRemove; without it the layer keeps listening to the map.
      else if (map) layer.onRemove?.(map, undefined as unknown as WebGL2RenderingContext);
    }
    this.custom = [];
  }

  /** Remove everything the control added; `restore` puts hidden style layers back. */
  private teardown(restore: boolean) {
    const map = this.map;
    this.stopWaiting?.();
    this.building = true;
    try {
      this.removeCustom();
      if (map) {
        for (const id of this.native) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(this.sourceId()) && this.styleReady()) map.removeSource(this.sourceId());
        if (restore && this.styleReady()) {
          for (const [id, visibility] of this.hidden) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
        }
      }
      this.native = [];
      this.hidden.clear();
      this.scene = null;
    } finally {
      this.building = false;
    }
  }

  /**
   * Hide the style's own 3D buildings (`hideLayers`) only once the scene's buildings source has
   * loaded. Without a working API key it answers 403, and the style keeps its buildings.
   */
  private hideOnceBuildingsLoad(generation: number) {
    const map = this.map!;
    const id = this.sourceId();
    const onData = (e: MapSourceDataEvent) => {
      // removeSource fires a metadata event too; the source is gone by then.
      if (e.sourceId !== id || e.sourceDataType !== "metadata" || !map.getSource(id)) return;
      this.stopWaiting?.();
      if (generation === this.generation && this.styleReady()) this.hideStyleLayers();
    };
    map.on("sourcedata", onData);
    this.stopWaiting = () => {
      map.off("sourcedata", onData);
      this.stopWaiting = undefined;
    };
  }

  private hideStyleLayers() {
    const map = this.map!;
    for (const id of this.options.hideLayers) {
      if (!map.getLayer(id)) continue;
      this.hidden.set(id, (map.getLayoutProperty(id, "visibility") as "visible" | "none" | undefined) ?? "visible");
      map.setLayoutProperty(id, "visibility", "none");
    }
  }

  private withKey(url: string): string {
    if (!this.options.apiKey) return url;
    const u = new URL(url, document.baseURI);
    if (!u.searchParams.has("api_key")) u.searchParams.set("api_key", this.options.apiKey);
    return u.href;
  }

  private modelUrl(url: string): string {
    return new URL(url, this.options.modelBase ?? document.baseURI).href;
  }

  private showState() {
    this.button?.setAttribute("aria-pressed", String(this.enabled));
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }
}
