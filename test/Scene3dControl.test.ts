import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Scene3dControl, SCENE3D_METADATA_KEY, type Scene3dLibrary, type Scene3dManifest } from "../src/Scene3dControl";

const SCENE: Scene3dManifest = {
  version: 1,
  source: "https://example.com/buildings.json",
  building_extruded: { filter: ["!=", ["get", "extrude"], false], paint: { "fill-extrusion-height": ["get", "height"] } },
  building_3d: { paint: { "fill-3d-color": "#eee" }, style_layers: [{ layers: ["building_extruded"], layout: { visibility: "none" } }] },
  models: { tree: "https://example.com/tree.gltf", rock: "models/rock.gltf" },
  gltf: [
    { id: "trees", models: ["tree"], source: "mtk", "source-layer": "natural", minzoom: 15 },
    { id: "rocks", source: "mtk", "source-layer": "natural", position: "top" },
    { id: "elsewhere", source: "other", "source-layer": "x" },
  ],
};

type Layer = { id: string; type: string; layout?: Record<string, unknown>; [k: string]: unknown };

/** The test style's own layers, fresh each time (a style update brings new objects). */
const baseLayers = (): Layer[] => [
  { id: "background", type: "background" },
  { id: "building_extruded", type: "fill-extrusion", layout: {} },
  { id: "road", type: "line" },
  { id: "road_label", type: "symbol" },
  { id: "place_label", type: "symbol" },
];

/** A stand-in for maplibre-gl's Map with just what the control touches. */
function createMap({ metadata = { [SCENE3D_METADATA_KEY]: SCENE } as Record<string, unknown>, zoom = 16, pitch = 60 } = {}) {
  const listeners = new Map<string, Set<(e?: unknown) => void>>();
  // Like MapLibre's Style: the stylesheet it keeps holds the current metadata.
  const makeStyle = () => ({
    _loaded: true,
    stylesheet: {
      get metadata() {
        return metadata;
      },
    },
  });
  let style = makeStyle();
  let layers: Layer[] = baseLayers();
  const sources = new Set(["mtk"]);
  const globalState: Record<string, unknown> = {};
  let terrain: { source: string; exaggeration?: number } | null = null;
  const map = {
    get style() {
      return style;
    },
    on: (t: string, f: (e?: unknown) => void) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
    off: (t: string, f: (e?: unknown) => void) => void listeners.get(t)?.delete(f),
    fire: (t: string) => listeners.get(t)?.forEach((f) => f()),
    getStyle: () => ({ version: 8, sources: {}, layers: layers.map(({ id, type }) => ({ id, type })), metadata }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getLayersOrder: () => layers.map((l) => l.id),
    addLayer: (layer: Layer, before?: string) => {
      const at = before ? layers.findIndex((l) => l.id === before) : -1;
      layers.splice(at < 0 ? layers.length : at, 0, layer);
      listeners.get("styledata")?.forEach((f) => f());
    },
    removeLayer: (id: string) => void (layers = layers.filter((l) => l.id !== id)),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    addSource: vi.fn((id: string) => void sources.add(id)),
    removeSource: (id: string) => void sources.delete(id),
    getLayoutProperty: (id: string, k: string) => layers.find((l) => l.id === id)?.layout?.[k],
    getPaintProperty: (id: string, k: string) => (layers.find((l) => l.id === id)?.paint as Record<string, unknown> | undefined)?.[k],
    setPaintProperty: (id: string, k: string, v: unknown) => {
      const l = layers.find((x) => x.id === id);
      if (l) l.paint = { ...(l.paint as Record<string, unknown> | undefined), [k]: v };
    },
    setLayoutProperty: (id: string, k: string, v: unknown) => {
      const l = layers.find((x) => x.id === id);
      if (l) l.layout = { ...l.layout, [k]: v };
    },
    getPitch: () => pitch,
    setPitch: (p: number) => {
      pitch = p;
      listeners.get("pitch")?.forEach((f) => f());
    },
    getZoom: () => zoom,
    getTerrain: () => terrain,
    // Like MapLibre: fires `terrain` on every call, also with the same options.
    setTerrain: (t: { source: string; exaggeration?: number } | null) => {
      terrain = t;
      listeners.get("terrain")?.forEach((f) => f());
    },
    setGlobalStateProperty: (k: string, v: unknown) => void (globalState[k] = v),
    getContainer: () => document.createElement("div"),
    // test helpers
    globalState,
    /** The source's TileJSON arrived, as MapLibre reports it. */
    loadSource: (id: string) => listeners.get("sourcedata")?.forEach((f) => f({ sourceId: id, sourceDataType: "metadata" })),
    ids: () => layers.map((l) => l.id),
    newStyle: (next: Layer[], nextMetadata: Record<string, unknown> = {}) => {
      style = makeStyle();
      layers = next;
      metadata = nextMetadata;
      sources.clear();
      sources.add("mtk");
      listeners.get("style.load")?.forEach((f) => f());
    },
    /**
     * setStyle with diff, as MapLibre does it: layers and sources the new style lacks are dropped, but
     * custom layers stay where they were (MapLibre never serializes them, so the diff never sees them).
     */
    // MapLibre 6 then fires style.load with the same Style object, then styledata; `styleLoad: false`
    // leaves out the style.load, as older MapLibre versions do.
    diffStyle: (next: Layer[], nextMetadata: Record<string, unknown> = {}, { styleLoad = true } = {}) => {
      const old = layers;
      const result = [...next];
      old.forEach((layer, i) => {
        if (layer.type !== "custom") return;
        const prev = old
          .slice(0, i)
          .reverse()
          .find((p) => result.some((r) => r.id === p.id));
        result.splice(prev ? result.findIndex((r) => r.id === prev.id) + 1 : 0, 0, layer);
      });
      layers = result;
      metadata = nextMetadata;
      for (const id of [...sources]) if (id !== "mtk") sources.delete(id);
      if (styleLoad) listeners.get("style.load")?.forEach((f) => f());
      listeners.get("styledata")?.forEach((f) => f());
    },
  };
  return map as typeof map & MaplibreMap;
}

function fakeLibrary() {
  const made: Array<{ kind: string; options: Record<string, unknown>; onRemove: ReturnType<typeof vi.fn> }> = [];
  const factory = (kind: string) =>
    class {
      id: string;
      type = "custom" as const;
      options: Record<string, unknown>;
      onRemove = vi.fn();
      constructor(options: Record<string, unknown>) {
        this.id = options.id as string;
        this.options = options;
        made.push({ kind, options, onRemove: this.onRemove });
      }
      render() {}
    };
  const lib = { Fill3DLayer: factory("fill3d"), GltfLayer: factory("gltf") } as unknown as Scene3dLibrary;
  return { lib, made, load: vi.fn(() => Promise.resolve(lib)) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Scene3dControl", () => {
  it("builds the style's scene under the labels, with the api key on the source", async () => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    const control = new Scene3dControl({ apiKey: "KEY", library: load });
    control.onAdd(map);
    await flush();

    expect(map.addSource).toHaveBeenCalledWith("scene3d-buildings", { type: "vector", url: "https://example.com/buildings.json?api_key=KEY" });
    expect(map.ids()).toEqual([
      "background",
      "building_extruded",
      "road",
      "scene3d-building_extruded",
      "scene3d-building_3d",
      "scene3d-trees",
      "road_label",
      "place_label",
      "scene3d-rocks",
    ]);
    expect(made.map((m) => m.options.id)).toEqual(["scene3d-building_3d", "scene3d-trees", "scene3d-rocks"]);
    expect(made[1].options.models).toEqual({ tree: "https://example.com/tree.gltf" });
    expect(String((made[2].options.models as Record<string, string>).rock)).toMatch(/\/models\/rock\.gltf$/);
    expect(control.getScene()).toBe(SCENE);
  });

  it("puts a layer right below the style layer its position names, under the labels when the style lacks it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene: Scene3dManifest = {
      ...SCENE,
      building_extruded: { ...SCENE.building_extruded, position: "place_label" },
      building_3d: { ...SCENE.building_3d, position: "place_label" },
      gltf: [{ id: "trees", models: ["tree"], source: "mtk", "source-layer": "natural", position: "no_such_layer" }],
    };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const { load } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    expect(map.ids()).toEqual([
      "background",
      "building_extruded",
      "road",
      "scene3d-trees",
      "road_label",
      "scene3d-building_extruded",
      "scene3d-building_3d",
      "place_label",
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"no_such_layer"'));

    // A diffed setStyle with the same scene puts LOD1 back where it was: under the Fill3D layer of the same position.
    map.loadSource("scene3d-buildings");
    const before = map.ids();
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: structuredClone(scene) });
    await flush();
    expect(map.ids()).toEqual(before);
    warn.mockRestore();
  });

  it("leaves out vegetation whose source the style lacks, and hides the style's own 3D buildings once its source loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = createMap();
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    expect(map.ids()).not.toContain("scene3d-elsewhere");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no source "other"'));
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined(); // TileJSON not there yet
    map.loadSource("mtk");
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined(); // another source
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBe("none");
    control.onRemove();
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined(); // the style's own value again
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
    warn.mockRestore();
  });

  it("keeps the style's own 3D buildings while the buildings source does not load (missing or wrong API key)", async () => {
    const map = createMap();
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    // MapLibre answers a 403 on the TileJSON with an error event, never with the metadata event.
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();
    control.onRemove();
    map.loadSource("scene3d-buildings"); // a late answer after removal changes nothing
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();
  });

  it("adds no buildings source and hides nothing for a scene without buildings", async () => {
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { ...SCENE, building_extruded: undefined, building_3d: undefined } } });
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.ids()).toContain("scene3d-trees");
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();
    // a diffed setStyle with the same trees-only scene keeps it as it is
    const count = map.ids().length;
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: { ...SCENE, building_extruded: undefined, building_3d: undefined } });
    await flush();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.ids()).toHaveLength(count);
  });

  it("keeps the 3D layers through a terrain change: they move onto the terrain themselves", async () => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    const control = new Scene3dControl({ library: load });
    control.onAdd(map);
    await flush();
    const count = made.length;
    const layers = control.getLayers();
    map.setTerrain({ source: "dem", exaggeration: 1 }); // terrain on
    map.setTerrain({ source: "dem", exaggeration: 1.5 }); // exaggeration changed
    map.setTerrain(null); // terrain off
    expect(made.length).toBe(count);
    expect(control.getLayers().every((layer, i) => layer === layers[i])).toBe(true);
  });

  it("keeps the tilt in the global state pitch", () => {
    const map = createMap({ pitch: 59.6 });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    expect(map.globalState.pitch).toBe(60);
    map.setPitch(31.2);
    expect(map.globalState.pitch).toBe(31);
  });

  it("loads the 3D library only from minzoom", async () => {
    const map = createMap({ zoom: 10 });
    const { load } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    expect(load).not.toHaveBeenCalled();
    expect(map.ids()).toContain("scene3d-building_extruded"); // the native part needs no library
  });

  it("rebuilds from the new style on a style switch, and disposes layers the old style took with it", async () => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    const before = made.length;
    map.newStyle(
      [
        { id: "bg", type: "background" },
        { id: "label", type: "symbol" },
      ],
      {},
    );
    await flush();
    expect(made.slice(0, before).every((m) => m.onRemove.mock.calls.length === 1)).toBe(true);
    expect(map.ids()).toEqual(["bg", "label"]); // the new style has no scene

    map.newStyle(
      [
        { id: "bg", type: "background" },
        { id: "label", type: "symbol" },
      ],
      { [SCENE3D_METADATA_KEY]: SCENE },
    );
    await flush();
    expect(map.ids()).toContain("scene3d-trees");
  });

  it.each([
    ["MapLibre 6 (style.load)", true],
    ["older MapLibre (styledata only)", false],
  ])("keeps the 3D layers through a diffed setStyle with the same scene: %s", async (_, styleLoad) => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    map.loadSource("scene3d-buildings");
    const before = map.ids();
    const count = made.length;
    // An editor applying an edit: the same style layers (its own 3D buildings visible again), the same scene.
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: structuredClone(SCENE) }, { styleLoad });
    await flush();
    expect(made).toHaveLength(count); // no new 3D layers
    expect(map.ids()).toEqual(before); // LOD1 back under them
    expect(map.addSource).toHaveBeenCalledTimes(2);
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBe("none"); // the source had loaded: hidden at once
  });

  it("rebuilds after a diffed setStyle with another scene", async () => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    const count = made.length;
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: { ...SCENE, gltf: SCENE.gltf!.slice(0, 1) } });
    await flush();
    expect(made.length).toBe(count + 2); // Fill3D and the one glTF layer, new
    expect(map.ids()).toContain("scene3d-trees");
    expect(map.ids()).not.toContain("scene3d-rocks");
  });

  it("keeps the layers when setScene gets the same scene again", async () => {
    const map = createMap({ metadata: {} });
    const { load, made } = fakeLibrary();
    const control = new Scene3dControl({ library: load });
    control.onAdd(map);
    await control.setScene(SCENE);
    await flush();
    const count = made.length;
    await control.setScene(structuredClone(SCENE));
    await flush();
    expect(made).toHaveLength(count);
    await control.setScene({ ...SCENE, gltf: [] });
    await flush();
    expect(made.length).toBeGreaterThan(count);
  });

  it("builds a scene a diffed setStyle brings and removes one it takes away", async () => {
    const map = createMap({ metadata: {} });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    await flush();
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: SCENE });
    await flush();
    expect(map.ids()).toEqual(expect.arrayContaining(["scene3d-building_extruded", "scene3d-building_3d", "scene3d-trees"]));
    map.diffStyle(baseLayers(), {});
    await flush();
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
  });

  it("can be switched off, overridden with another scene and given a toggle button", async () => {
    const map = createMap();
    const control = new Scene3dControl({ library: fakeLibrary().load, button: true });
    const container = control.onAdd(map);
    await flush();
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(control.isEnabled()).toBe(false);
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);

    control.setEnabled(true);
    await control.setScene({ version: 1, source: "https://example.com/b.json", building_extruded: { paint: {} } });
    expect(map.ids().filter((id) => id.startsWith("scene3d-"))).toEqual(["scene3d-building_extruded"]);
    await control.setScene(null);
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
  });

  it("uses an invisible consumer layer when the scene has Fill3D but no LOD1", async () => {
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { version: 1, source: "https://example.com/b.json", building_3d: { paint: {} } } } });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    await flush();
    const consumer = map.getLayer("scene3d-consumer");
    expect(consumer?.filter).toEqual(["boolean", false]);
  });

  it("passes building_3d.extrusion on to the Fill3DLayer and keeps the building_extruded zoom range", async () => {
    const extrusion = { "source-layer": "buildings2d", filter: ["all", ["!=", ["get", "extrude"], false], [">=", ["zoom"], 15]] as never };
    const scene: Scene3dManifest = {
      ...SCENE,
      building_extruded: { ...SCENE.building_extruded, maxzoom: 15 },
      building_3d: { ...SCENE.building_3d, extrusion },
    };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();

    expect(made[0].options).toEqual({
      id: "scene3d-building_3d",
      source: "scene3d-buildings",
      "source-layer": "buildings3d",
      paint: SCENE.building_3d!.paint,
      extrusion,
    });
    expect(map.getLayer("scene3d-building_extruded")?.maxzoom).toBe(15);
  });

  it("draws the landmarks as a layer of their own and keeps them out of the buildings", async () => {
    const isLandmark = ["==", ["get", "source"], "landmark"];
    const paint = {
      "fill-3d-color": ["to-color", ["get", "colour"], "#ffffff"],
      "fill-3d-ambient-occlusion-intensity": 0.25,
      "fill-3d-ambient-occlusion-radius": 1.5,
      "fill-3d-ambient-occlusion-ground-radius": 2.5,
    };
    const buildingsPaint = { "fill-3d-color": "#eee", "fill-3d-ambient-occlusion-intensity": 0.5 };
    const scene: Scene3dManifest = { ...SCENE, building_3d: { paint: buildingsPaint }, landmarks_3d: { position: "place_label", paint } };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const { load, made } = fakeLibrary();
    const control = new Scene3dControl({ library: load });
    control.onAdd(map);
    await flush();

    // right below the layer its position names, the buildings under the labels as before
    expect(map.ids()).toEqual([
      "background",
      "building_extruded",
      "road",
      "scene3d-building_extruded",
      "scene3d-building_3d",
      "scene3d-trees",
      "road_label",
      "scene3d-landmarks_3d",
      "place_label",
      "scene3d-rocks",
    ]);
    const [fill3d, landmarks] = made;
    expect(landmarks.kind).toBe("fill3d"); // a Fill3DLayer too
    expect(landmarks.options).toEqual({ id: "scene3d-landmarks_3d", source: "scene3d-buildings", "source-layer": "buildings3d", filter: isLandmark, paint });
    expect(fill3d.options.filter).toEqual(["all", ["!", isLandmark]]);
    expect(fill3d.options.paint).toEqual(buildingsPaint); // the AO keys pass through
    expect(scene.building_3d).toEqual({ paint: buildingsPaint }); // the scene itself is left as it is
    expect(control.getLayers().map((l) => l.id)).toContain("scene3d-landmarks_3d");

    // kept through a terrain change like the other 3D layers, removed with them
    map.setTerrain({ source: "dem" });
    expect(made.filter((m) => m.options.id === "scene3d-landmarks_3d")).toHaveLength(1);
    control.onRemove();
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
  });

  it("combines the buildings' own filter with the landmarks' filter, also one the scene names", async () => {
    const own = ["==", ["get", "kind"], "landmark"];
    const scene: Scene3dManifest = { ...SCENE, building_3d: { filter: ["==", ["get", "type"], "roof"] }, landmarks_3d: { filter: own as never } };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    expect(made[0].options.filter).toEqual(["all", ["==", ["get", "type"], "roof"], ["!", own]]);
    expect(made[1].options.filter).toEqual(own);
    // both under the labels: the landmarks over the buildings
    expect(map.ids().indexOf("scene3d-landmarks_3d")).toBe(map.ids().indexOf("scene3d-building_3d") + 1);
  });

  it("leaves the buildings' layer as it is for a scene without landmarks", async () => {
    const map = createMap();
    const { load, made } = fakeLibrary();
    new Scene3dControl({ library: load }).onAdd(map);
    await flush();
    expect(made[0].options).toEqual({
      id: "scene3d-building_3d",
      source: "scene3d-buildings",
      "source-layer": "buildings3d",
      paint: { "fill-3d-color": "#eee" },
    });
    expect(map.ids()).not.toContain("scene3d-landmarks_3d");
  });

  it("draws landmarks without buildings: the source with a consumer layer, the style's own 3D buildings kept", async () => {
    const scene = { version: 1, source: "https://example.com/b.json", landmarks_3d: { paint: {} } } as Scene3dManifest;
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const { load, made } = fakeLibrary();
    new Scene3dControl({ apiKey: "KEY", library: load }).onAdd(map);
    await flush();
    expect(map.addSource).toHaveBeenCalledWith("scene3d-buildings", { type: "vector", url: "https://example.com/b.json?api_key=KEY" });
    expect(map.getLayer("scene3d-consumer")?.filter).toEqual(["boolean", false]);
    expect(made.map((m) => m.options.id)).toEqual(["scene3d-landmarks_3d"]);
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();
    // a diffed setStyle with the same scene puts the source and the consumer back and keeps the layer
    map.diffStyle(baseLayers(), { [SCENE3D_METADATA_KEY]: structuredClone(scene) });
    await flush();
    expect(map.addSource).toHaveBeenCalledTimes(2);
    expect(map.ids()).toEqual(expect.arrayContaining(["scene3d-consumer", "scene3d-landmarks_3d"]));
    expect(made).toHaveLength(1);
  });

  it("reads a scene with the entry names before 0.8.0 (lod1, fill3d, landmarks) as the new ones", async () => {
    const landmarks = { position: "place_label", paint: { "fill-3d-color": "#f00" } };
    const current: Scene3dManifest = { ...SCENE, landmarks_3d: landmarks };
    const { building_extruded, building_3d, landmarks_3d, ...rest } = current;
    const old = { ...rest, lod1: building_extruded, fill3d: building_3d, landmarks: landmarks_3d } as Scene3dManifest;
    const build = async (scene: Scene3dManifest) => {
      const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
      const { load, made } = fakeLibrary();
      const control = new Scene3dControl({ library: load });
      control.onAdd(map);
      await flush();
      return { ids: map.ids(), options: made.map((m) => m.options), scene: control.getScene() };
    };
    const fromOld = await build(old);
    expect(fromOld).toEqual(await build(current));
    expect(fromOld.ids).toEqual(expect.arrayContaining(["scene3d-building_extruded", "scene3d-building_3d", "scene3d-landmarks_3d"]));
    expect(fromOld.scene).toEqual(current);
    expect(old).not.toHaveProperty("building_3d"); // the style's scene itself is left as it is
    // a scene with both names: the new one wins
    const both = { ...current, fill3d: { paint: { "fill-3d-color": "#000" } } } as Scene3dManifest;
    expect((await build(both)).options[0].paint).toEqual({ "fill-3d-color": "#eee" });
  });

  it("adjusts the style layers the scene names (style_layers) once the source loads, and puts the style's values back", async () => {
    const fade = ["interpolate", ["linear"], ["zoom"], 15, 1, 15.5, 0.5];
    const scene: Scene3dManifest = {
      ...SCENE,
      landmarks_3d: { paint: {}, style_layers: [{ layers: ["road_label", "place_label", "no_such_layer"], paint: { "text-opacity": fade } }] },
    };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    map.setPaintProperty("road_label", "text-opacity", 0.8); // a value of the style's own
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    expect(map.getPaintProperty("place_label", "text-opacity")).toBeUndefined(); // TileJSON not there yet
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBe("none");
    expect(map.getPaintProperty("road_label", "text-opacity")).toEqual(fade);
    expect(map.getPaintProperty("place_label", "text-opacity")).toEqual(fade);
    expect(map.ids()).not.toContain("no_such_layer"); // skipped, nothing added
    // the scene's options never reach the layers
    expect(map.getLayer("scene3d-building_extruded")).not.toHaveProperty("style_layers");
    control.onRemove();
    expect(map.getPaintProperty("road_label", "text-opacity")).toBe(0.8);
    expect(map.getPaintProperty("place_label", "text-opacity")).toBeUndefined();
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();
  });

  it("adjusts them again after a diffed setStyle, and then puts back the new style's values", async () => {
    const scene: Scene3dManifest = { ...SCENE, landmarks_3d: { style_layers: [{ layers: ["place_label"], paint: { "text-opacity": 0.3 } }] } };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    map.loadSource("scene3d-buildings");
    expect(map.getPaintProperty("place_label", "text-opacity")).toBe(0.3);
    // an editor applying an edit: the same scene, the label layer now with an opacity of its own
    const next = baseLayers().map((l) => (l.id === "place_label" ? { ...l, paint: { "text-opacity": 0.9 } } : l));
    map.diffStyle(next, { [SCENE3D_METADATA_KEY]: structuredClone(scene) });
    await flush();
    expect(map.getPaintProperty("place_label", "text-opacity")).toBe(0.3); // the source had loaded: at once
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBe("none");
    control.onRemove();
    expect(map.getPaintProperty("place_label", "text-opacity")).toBe(0.9);
  });

  it("adjusts nothing while the buildings source does not load, or when the scene names no style layers", async () => {
    const scene: Scene3dManifest = { ...SCENE, landmarks_3d: { style_layers: [{ layers: ["place_label"], paint: { "text-opacity": 0.3 } }] } };
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: scene } });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    await flush();
    // no metadata event: a 403 on the TileJSON
    expect(map.getPaintProperty("place_label", "text-opacity")).toBeUndefined();
    expect(map.getLayoutProperty("building_extruded", "visibility")).toBeUndefined();

    const plain = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { ...SCENE, building_3d: { paint: {} } } } });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(plain);
    await flush();
    plain.loadSource("scene3d-buildings");
    expect(plain.getLayoutProperty("building_extruded", "visibility")).toBeUndefined(); // no list of its own any more
  });

  it("warns once when the map's WebGL context has no multisampling", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { load } = fakeLibrary();
    const withAntialias = (antialias: boolean) =>
      Object.assign(createMap(), { getCanvas: () => ({ getContext: () => ({ getContextAttributes: () => ({ antialias }) }) }) });
    new Scene3dControl({ library: load }).onAdd(withAntialias(true));
    await flush();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("multisampling"));
    const control = new Scene3dControl({ library: load });
    const map = withAntialias(false);
    control.onAdd(map);
    control.onRemove();
    control.onAdd(map);
    await flush();
    expect(warn.mock.calls.filter(([m]) => String(m).includes("multisampling"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("ignores unknown scene versions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { version: 2, source: "x" } } });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    await flush();
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unsupported scene version 2"));
    warn.mockRestore();
  });
});
