import { describe, expect, it } from "vitest";

import { getTiltedImageGeometry } from "@repo/ui/lib/crop-image";

describe("image straightening geometry", () => {
  const width = 4_032;
  const height = 3_024;

  it("keeps the original bounds and exact identity at zero tilt", () => {
    expect(getTiltedImageGeometry(width, height, 0)).toEqual({
      width,
      height,
      matrix: [1, 0, 0, 1, 0, 0],
    });
  });

  it.each([-45, -15, -7.3, -0.1, 0.1, 7.3, 15, 45])(
    "retains all four corners at %s degrees in centered whole-pixel bounds",
    (angle) => {
      const geometry = getTiltedImageGeometry(width, height, angle);
      const [a, b, c, d, e, f] = geometry.matrix;
      const transform = ([x, y]: number[]) => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ].map(transform);
      const left = Math.min(...corners.map(([x]) => x));
      const top = Math.min(...corners.map(([, y]) => y));
      const right = Math.max(...corners.map(([x]) => x));
      const bottom = Math.max(...corners.map(([, y]) => y));

      expect(Number.isInteger(geometry.width)).toBe(true);
      expect(Number.isInteger(geometry.height)).toBe(true);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(geometry.width);
      expect(bottom).toBeLessThanOrEqual(geometry.height);
      expect(left).toBeLessThan(0.5);
      expect(top).toBeLessThan(0.5);
      expect(geometry.width - right).toBeCloseTo(left);
      expect(geometry.height - bottom).toBeCloseTo(top);
      const center = transform([width / 2, height / 2]);
      expect(center[0]).toBeCloseTo(geometry.width / 2);
      expect(center[1]).toBeCloseTo(geometry.height / 2);
      expect(a * d - b * c).toBeCloseTo(1);
      // Positive tilt moves the right end of a horizontal line downwards.
      expect(Math.sign(corners[1][1] - corners[0][1])).toBe(Math.sign(angle));
    },
  );

  it("uses the same bounds for equal clockwise and anticlockwise angles", () => {
    const clockwise = getTiltedImageGeometry(width, height, 11.7);
    const anticlockwise = getTiltedImageGeometry(width, height, -11.7);
    expect(clockwise.width).toBe(anticlockwise.width);
    expect(clockwise.height).toBe(anticlockwise.height);
  });

  it.each([NaN, Infinity, -Infinity, 45.1, -45.1])(
    "rejects invalid angle %s",
    (angle) => {
      expect(() => getTiltedImageGeometry(width, height, angle)).toThrow(
        RangeError,
      );
    },
  );

  it.each([
    [0, height],
    [width, 0],
    [-1, height],
    [width, NaN],
    [Infinity, height],
  ])("rejects invalid image dimensions %s × %s", (imageWidth, imageHeight) => {
    expect(() => getTiltedImageGeometry(imageWidth, imageHeight, 5)).toThrow(
      RangeError,
    );
  });
});
