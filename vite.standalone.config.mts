import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// The second build (after vite.config.mts, which wrote the package entry, the types and the CSS): the standalone
// entry src/standalone.ts, and next to it the standalone build of the maplibre-3d-layers version installed here
// (three.js included), named after that version.
const libraryRoot = fileURLToPath(new URL("./node_modules/@maptoolkit/maplibre-3d-layers/", import.meta.url));
const { version } = JSON.parse(readFileSync(join(libraryRoot, "package.json"), "utf8")) as { version: string };
const libraryFile = `maplibre-3d-layers-${version}.standalone.mjs`;
const entryFile = "maplibre-scene3d-control.standalone.js";

/** Copies the library into dist/ and checks that the entry asks for exactly that file. */
function bundleLibrary(): Plugin {
  return {
    name: "bundle-maplibre-3d-layers",
    // The CSS is the first build's maplibre-scene3d-control.css; this build would add the same rules as style.css.
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (name.endsWith(".css")) delete bundle[name];
    },
    writeBundle(options, bundle) {
      const entry = bundle[entryFile];
      if (!entry || entry.type !== "chunk" || !entry.code.includes(libraryFile)) {
        this.error(`${entryFile} does not load ${libraryFile}`);
      }
      copyFileSync(join(libraryRoot, "dist", "maplibre-3d-layers.standalone.mjs"), join(options.dir ?? "dist", libraryFile));
    },
  };
}

export default defineConfig({
  define: { __BUNDLED_LIBRARY__: JSON.stringify(libraryFile) },
  plugins: [bundleLibrary()],
  build: {
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("./src/standalone.ts", import.meta.url)),
      fileName: () => entryFile,
      formats: ["es"],
    },
    rollupOptions: {
      // The package's own dynamic import of maplibre-3d-layers stays external and is never called here: the
      // standalone Scene3dControl passes the bundled copy as `library`.
      external: ["maplibre-gl", "@maptoolkit/maplibre-3d-layers", "three"],
    },
  },
});
