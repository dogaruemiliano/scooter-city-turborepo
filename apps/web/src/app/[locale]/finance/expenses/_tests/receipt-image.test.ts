import { describe, expect, it } from "vitest";

import { cropPixels, resizeCropRect } from "../_lib/receipt-image";

describe("receipt image crop geometry", () => {
  it("maps a normalized crop to source pixels", () => {
    expect(
      cropPixels({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 }, 4_000, 3_000),
    ).toEqual({ x: 1_000, y: 300, width: 2_000, height: 2_400 });
  });

  it("keeps resized corners inside the image and preserves a usable crop", () => {
    const result = resizeCropRect(
      { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      "north-west",
      1,
      1,
    );

    expect(result.x).toBeCloseTo(0.75);
    expect(result.y).toBeCloseTo(0.75);
    expect(result.width).toBeCloseTo(0.15);
    expect(result.height).toBeCloseTo(0.15);
  });
});
