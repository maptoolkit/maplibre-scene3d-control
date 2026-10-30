import { describe, expect, it } from "vitest";
import type { Scene3dLibrary } from "../src/Scene3dControl";
import { Scene3dControl, bundledLibrary } from "../src/standalone";

describe("standalone build", () => {
  it("loads the bundled 3D library by default", () => {
    expect(new Scene3dControl().options.library).toBe(bundledLibrary);
    expect(new Scene3dControl({ library: undefined }).options.library).toBe(bundledLibrary);
  });

  it("keeps a library the app passes", () => {
    const library = async () => ({}) as Scene3dLibrary;
    expect(new Scene3dControl({ library }).options.library).toBe(library);
  });

  it("keeps the other options", () => {
    const control = new Scene3dControl({ apiKey: "KEY", minzoom: 13 });
    expect(control.options.apiKey).toBe("KEY");
    expect(control.options.minzoom).toBe(13);
  });
});
