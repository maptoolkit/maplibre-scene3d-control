import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Scene3dControl, SCENE3D_METADATA_KEY, type Scene3dLibrary, type Scene3dManifest } from "../src/Scene3dControl";

const SCENE: Scene3dManifest = {
  version: 1,
  source: "https://example.com/buildings.json",
  lod1: { filter: ["!=", ["get", "extrude"], false], paint: { "fill-extrusion-height": ["get", "height"] } },
  fill3d: { paint: { "fill-3d-color": "#eee" } },
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
  { id: "building_3d", type: "fill-extrusion", layout: {} },
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
      "building_3d",
      "road",
      "scene3d-lod1",
      "scene3d-fill3d",
      "scene3d-trees",
      "road_label",
      "place_label",
      "scene3d-rocks",
    ]);
    expect(made.map((m) => m.options.id)).toEqual(["scene3d-fill3d", "scene3d-trees", "scene3d-rocks"]);
    expect(made[1].options.models).toEqual({ tree: "https://example.com/tree.gltf" });
    expect(String((made[2].options.models as Record<string, string>).rock)).toMatch(/\/models\/rock\.gltf$/);
    expect(control.getScene()).toBe(SCENE);
  });

  it("leaves out vegetation whose source the style lacks, and hides the style's own 3D buildings once its source loads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = createMap();
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    expect(map.ids()).not.toContain("scene3d-elsewhere");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no source "other"'));
    expect(map.getLayoutProperty("building_3d", "visibility")).toBeUndefined(); // TileJSON not there yet
    map.loadSource("mtk");
    expect(map.getLayoutProperty("building_3d", "visibility")).toBeUndefined(); // another source
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_3d", "visibility")).toBe("none");
    control.onRemove();
    expect(map.getLayoutProperty("building_3d", "visibility")).toBe("visible");
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
    warn.mockRestore();
  });

  it("keeps the style's own 3D buildings while the buildings source does not load (missing or wrong API key)", async () => {
    const map = createMap();
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    // MapLibre answers a 403 on the TileJSON with an error event, never with the metadata event.
    expect(map.getLayoutProperty("building_3d", "visibility")).toBeUndefined();
    control.onRemove();
    map.loadSource("scene3d-buildings"); // a late answer after removal changes nothing
    expect(map.getLayoutProperty("building_3d", "visibility")).toBeUndefined();
  });

  it("hides nothing for a scene without buildings", async () => {
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { ...SCENE, lod1: undefined, fill3d: undefined } } });
    const control = new Scene3dControl({ library: fakeLibrary().load });
    control.onAdd(map);
    await flush();
    map.loadSource("scene3d-buildings");
    expect(map.getLayoutProperty("building_3d", "visibility")).toBeUndefined();
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
    expect(map.ids()).toContain("scene3d-lod1"); // the native part needs no library
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
    expect(map.getLayoutProperty("building_3d", "visibility")).toBe("none"); // the source had loaded: hidden at once
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
    expect(map.ids()).toEqual(expect.arrayContaining(["scene3d-lod1", "scene3d-fill3d", "scene3d-trees"]));
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
    await control.setScene({ version: 1, source: "https://example.com/b.json", lod1: { paint: {} } });
    expect(map.ids().filter((id) => id.startsWith("scene3d-"))).toEqual(["scene3d-lod1"]);
    await control.setScene(null);
    expect(map.ids().some((id) => id.startsWith("scene3d-"))).toBe(false);
  });

  it("uses an invisible consumer layer when the scene has Fill3D but no LOD1", async () => {
    const map = createMap({ metadata: { [SCENE3D_METADATA_KEY]: { version: 1, source: "https://example.com/b.json", fill3d: { paint: {} } } } });
    new Scene3dControl({ library: fakeLibrary().load }).onAdd(map);
    await flush();
    const consumer = map.getLayer("scene3d-consumer");
    expect(consumer?.filter).toEqual(["boolean", false]);
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
