import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ tsconfigPath: "./tsconfig.json", include: ["src"] })],
  build: {
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      fileName: "maplibre-scene3d-control",
      formats: ["es"],
    },
    rollupOptions: {
      // maplibre-3d-layers (and three.js behind it) is a dependency the control loads on demand, see
      // Scene3dControlOptions.library; the standalone build (vite.standalone.config.mts) ships its own copy
      external: ["maplibre-gl", "@maptoolkit/maplibre-3d-layers", "three"],
    },
  },
});
