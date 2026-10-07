import { describe, expect, it } from "vitest";
import { centeredCropArea, clampCropArea, clampZoom, MAX_ZOOM, MIN_ZOOM, SQUARE_OUTPUT, WIDE_OUTPUT } from "./crop";

describe("crop geometry", () => {
  it("centers the largest square in a landscape source", () => {
    expect(centeredCropArea(1600, 900, SQUARE_OUTPUT)).toEqual({ x: 350, y: 0, width: 900, height: 900 });
  });

  it("centers the largest 2:1 area in a portrait source", () => {
    expect(centeredCropArea(800, 1200, WIDE_OUTPUT)).toEqual({ x: 0, y: 400, width: 800, height: 400 });
  });

  it("keeps a drifting area inside the source so the output has no empty edges", () => {
    expect(clampCropArea({ x: -4, y: 610, width: 500, height: 500 }, 1000, 1000)).toEqual({ x: 0, y: 500, width: 500, height: 500 });
    expect(clampCropArea({ x: 10, y: 10, width: 1200, height: 700 }, 1000, 600)).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
  });

  it("limits zoom to the supported range", () => {
    expect(clampZoom(0.4)).toBe(MIN_ZOOM);
    expect(clampZoom(4)).toBe(MAX_ZOOM);
    expect(clampZoom(1.2345)).toBe(1.23);
  });
});

describe("lesson image size", () => {
  it("caps the longest edge and never upscales", async () => {
    const { fitWithin } = await import("./crop");
    expect(fitWithin(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 });
    expect(fitWithin(900, 4000, 1600)).toEqual({ width: 360, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
