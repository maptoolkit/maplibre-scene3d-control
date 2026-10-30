import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __BUNDLED_LIBRARY__: JSON.stringify("maplibre-3d-layers-test.standalone.mjs") },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
