import { describe, expect, it } from "vitest";

import { isArtifactPath, storagePath } from "./schema";

describe("artifact paths", () => {
  it("accepts what the engine writes", () => {
    expect(isArtifactPath("episodes/nominal/1000.json")).toBe(true);
    expect(isArtifactPath("episodes/camera-pan_4/1012.mp4")).toBe(true);
    expect(isArtifactPath("episodes/lighting-dim_0.4/1003.mp4")).toBe(true);
  });
  it("rejects anything that could leave the run's folder", () => {
    for (const path of [
      "../other/episodes/a/1.json",
      "episodes/../../x/1.json",
      "episodes/a/../b/1.json",
      "/episodes/a/1.json",
      "episodes/a/b/1.json",
      "episodes/a/1.exe",
      "episodes/a/one.json",
      "episodes//1.json",
      "episodes/a/1.json/",
      "other/a/1.json",
    ]) {
      expect(isArtifactPath(path), path).toBe(false);
    }
  });
  it("scopes storage by project and run", () => {
    expect(storagePath("p", "r", "episodes/a/1.json")).toBe("p/r/episodes/a/1.json");
  });
});
