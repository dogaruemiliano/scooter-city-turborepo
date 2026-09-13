import { describe, expect, it } from "vitest";

import {
  getProjectedImageGeometry,
  getTiltedImageGeometry,
} from "@repo/ui/lib/crop-image";
import {
  invertHomography,
  projectImagePoint,
  resampleProjectedImage,
  type Homography,
} from "@repo/ui/lib/projective-image";

describe("image perspective geometry", () => {
  const width = 800;
  const height = 600;

  it.each([
    { tiltDegrees: 15 },
    { tiltDegrees: -15 },
    { rotationX: 45 },
    { rotationY: -45 },
    { rotationX: -30, rotationY: 30, tiltDegrees: 12 },
  ])("keeps the crop frame and rotation center fixed for %j", (options) => {
    const geometry = getProjectedImageGeometry(width, height, {
      ...options,
      fixedFrame: true,
    });
    expect(geometry.width).toBe(width);
    expect(geometry.height).toBe(height);
    const center = projectImagePoint(
      geometry.homography,
      width / 2,
      height / 2,
    );
    expect(center[0]).toBeCloseTo(width / 2);
    expect(center[1]).toBeCloseTo(height / 2);
  });

  it.each([-15, 0, 7.3, 45])(
    "preserves existing tilt geometry exactly when X/Y are reset, tilt=%s",
    (tiltDegrees) => {
      const tilted = getTiltedImageGeometry(width, height, tiltDegrees);
      const projected = getProjectedImageGeometry(width, height, {
        rotationX: 0,
        rotationY: 0,
        tiltDegrees,
      });
      const [a, b, c, d, e, f] = tilted.matrix;
      expect(projected.width).toBe(tilted.width);
      expect(projected.height).toBe(tilted.height);
      expect(projected.homography).toEqual([a, c, e, b, d, f, 0, 0, 1]);
    },
  );

  it.each([
    { rotationX: 30 },
    { rotationX: -30 },
    { rotationY: 30 },
    { rotationY: -30 },
    { rotationX: 45, rotationY: 45, tiltDegrees: 45 },
    { rotationX: -45, rotationY: 45, tiltDegrees: -45 },
    { rotationX: 13.4, rotationY: -24.6, tiltDegrees: 5.2 },
  ])("keeps full bounds and CSS projection consistent for %j", (options) => {
    const geometry = getProjectedImageGeometry(width, height, options);
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const projected = corners.map(([x, y]) =>
      projectImagePoint(geometry.homography, x, y),
    );
    const inverse = invertHomography(geometry.homography);
    for (const [index, [x, y]] of projected.entries()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-Number.EPSILON * width);
      expect(y).toBeGreaterThanOrEqual(-Number.EPSILON * height);
      expect(x).toBeLessThanOrEqual(geometry.width);
      expect(y).toBeLessThanOrEqual(geometry.height);
      const source = projectImagePoint(inverse, x, y);
      expect(source[0]).toBeCloseTo(corners[index][0]);
      expect(source[1]).toBeCloseTo(corners[index][1]);
      const m = geometry.matrix3d;
      const [sx, sy] = corners[index];
      const denominator = m[3] * sx + m[7] * sy + m[15];
      expect(denominator).toBeGreaterThan(0);
      expect((m[0] * sx + m[4] * sy + m[12]) / denominator).toBeCloseTo(x);
      expect((m[1] * sx + m[5] * sy + m[13]) / denominator).toBeCloseTo(y);
    }
    const left = Math.min(...projected.map(([x]) => x));
    const top = Math.min(...projected.map(([, y]) => y));
    expect(left).toBeLessThan(0.5);
    expect(top).toBeLessThan(0.5);
  });

  it("foreshortens X and Y independently instead of treating either as planar tilt", () => {
    const x = getProjectedImageGeometry(width, height, { rotationX: 30 });
    const y = getProjectedImageGeometry(width, height, { rotationY: 30 });
    const xTopLeft = projectImagePoint(x.homography, 0, 0);
    const xTopRight = projectImagePoint(x.homography, width, 0);
    const xBottomLeft = projectImagePoint(x.homography, 0, height);
    const xBottomRight = projectImagePoint(x.homography, width, height);
    expect(xTopLeft[1]).toBeCloseTo(xTopRight[1]);
    expect(xBottomLeft[1]).toBeCloseTo(xBottomRight[1]);
    expect(xBottomRight[0] - xBottomLeft[0]).toBeGreaterThan(
      xTopRight[0] - xTopLeft[0],
    );
    const yTopLeft = projectImagePoint(y.homography, 0, 0);
    const yTopRight = projectImagePoint(y.homography, width, 0);
    const yBottomLeft = projectImagePoint(y.homography, 0, height);
    const yBottomRight = projectImagePoint(y.homography, width, height);
    expect(yTopLeft[0]).toBeCloseTo(yBottomLeft[0]);
    expect(yTopRight[0]).toBeCloseTo(yBottomRight[0]);
    expect(yBottomLeft[1] - yTopLeft[1]).toBeGreaterThan(
      yBottomRight[1] - yTopRight[1],
    );
  });

  it("matches sequential centered X, Y, Z rotations followed by a perspective camera", () => {
    const options = { rotationX: 25, rotationY: -18, tiltDegrees: 11 };
    const geometry = getProjectedImageGeometry(width, height, options);
    const center = projectImagePoint(
      geometry.homography,
      width / 2,
      height / 2,
    );
    const rx = (options.rotationX * Math.PI) / 180;
    const ry = (options.rotationY * Math.PI) / 180;
    const rz = (options.tiltDegrees * Math.PI) / 180;
    const distance = Math.max(width, height) * 2;
    for (const [x, y] of [
      [0, 0],
      [width, height],
      [180, 260],
    ]) {
      const centeredX = x - width / 2;
      const centeredY = y - height / 2;
      const afterX = [
        centeredX,
        centeredY * Math.cos(rx),
        centeredY * Math.sin(rx),
      ];
      const afterY = [
        afterX[0] * Math.cos(ry) + afterX[2] * Math.sin(ry),
        afterX[1],
        -afterX[0] * Math.sin(ry) + afterX[2] * Math.cos(ry),
      ];
      const afterZ = [
        afterY[0] * Math.cos(rz) - afterY[1] * Math.sin(rz),
        afterY[0] * Math.sin(rz) + afterY[1] * Math.cos(rz),
        afterY[2],
      ];
      const perspectiveScale = distance / (distance - afterZ[2]);
      const projected = projectImagePoint(geometry.homography, x, y);
      expect(projected[0] - center[0]).toBeCloseTo(
        afterZ[0] * perspectiveScale,
      );
      expect(projected[1] - center[1]).toBeCloseTo(
        afterZ[1] * perspectiveScale,
      );
    }
  });

  it.each([
    { rotationX: NaN },
    { rotationY: Infinity },
    { rotationX: 45.1 },
    { rotationY: -45.1 },
  ])("rejects invalid perspective %j", (options) => {
    expect(() => getProjectedImageGeometry(width, height, options)).toThrow(
      RangeError,
    );
  });
});

describe("projective pixel resampling", () => {
  const identity: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it("samples pixel centers identically when the projection is reset", async () => {
    const source = pixels(
      2,
      2,
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 90, 120, 150, 255],
    );
    const destination = whitePixels(2, 2);
    await resampleProjectedImage(source, destination, identity);
    expect(destination.data).toEqual(source.data);
  });

  it("bilinearly samples four neighbors", async () => {
    const source = pixels(
      2,
      2,
      [0, 0, 0, 255, 100, 0, 0, 255, 0, 100, 0, 255, 100, 100, 0, 255],
    );
    const destination = whitePixels(1, 1);
    await resampleProjectedImage(
      source,
      destination,
      [1, 0, 0.5, 0, 1, 0.5, 0, 0, 1],
    );
    expect([...destination.data]).toEqual([50, 50, 0, 255]);
  });

  it("preserves the opaque backdrop outside the source and behind alpha", async () => {
    const source = pixels(1, 1, [255, 0, 0, 128]);
    const destination = whitePixels(2, 1);
    await resampleProjectedImage(source, destination, identity);
    expect([...destination.data]).toEqual([
      255, 127, 127, 255, 255, 255, 255, 255,
    ]);
  });

  it("retains the backdrop for invalid projection coordinates", async () => {
    const destination = whitePixels(1, 1);
    await resampleProjectedImage(
      pixels(1, 1, [255, 0, 0, 255]),
      destination,
      [1, 0, 0, 0, 1, 0, 0, 0, 0],
    );
    expect([...destination.data]).toEqual([255, 255, 255, 255]);
    expect(() => invertHomography([0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(
      RangeError,
    );
  });

  it("yields between bounded row chunks so the UI can respond", async () => {
    const source = whitePixels(512, 257);
    const destination = whitePixels(512, 257);
    let completed = false;
    const pending = resampleProjectedImage(source, destination, identity).then(
      () => {
        completed = true;
      },
    );
    await Promise.resolve();
    expect(completed).toBe(false);
    await pending;
    expect(completed).toBe(true);
  });
});

function pixels(width: number, height: number, values: number[]): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(values),
    colorSpace: "srgb",
  } as ImageData;
}

function whitePixels(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255),
    colorSpace: "srgb",
  } as ImageData;
}
