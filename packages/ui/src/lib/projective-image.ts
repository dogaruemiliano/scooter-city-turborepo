/** Row-major homography acting on image-edge coordinates [x, y, 1]. */
export type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function composeHomographies(a: Homography, b: Homography): Homography {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function invertHomography([
  a,
  b,
  c,
  d,
  e,
  f,
  g,
  h,
  i,
]: Homography): Homography {
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
    throw new RangeError("Image projection is not invertible");
  }
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export function projectImagePoint(
  matrix: Homography,
  x: number,
  y: number,
): [number, number] {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator,
  ];
}

/** Inverse-map pixel centers once; destination already contains an opaque backdrop. */
export async function resampleProjectedImage(
  source: ImageData,
  destination: ImageData,
  inverse: Homography,
): Promise<void> {
  const input = source.data;
  const output = destination.data;
  const [a, b, c, d, e, f, g, h, i] = inverse;
  // Bound synchronous work independently of output width, then let UI events run.
  const rowsPerChunk = Math.max(1, Math.floor(131_072 / destination.width));
  for (let y = 0; y < destination.height; y++) {
    const centerY = y + 0.5;
    for (let x = 0; x < destination.width; x++) {
      const centerX = x + 0.5;
      const denominator = g * centerX + h * centerY + i;
      if (
        !Number.isFinite(denominator) ||
        Math.abs(denominator) < Number.EPSILON
      )
        continue;
      const sourceX = (a * centerX + b * centerY + c) / denominator;
      const sourceY = (d * centerX + e * centerY + f) / denominator;
      if (
        !Number.isFinite(sourceX) ||
        !Number.isFinite(sourceY) ||
        sourceX < 0 ||
        sourceX >= source.width ||
        sourceY < 0 ||
        sourceY >= source.height
      )
        continue;

      const pixelX = Math.max(0, Math.min(source.width - 1, sourceX - 0.5));
      const pixelY = Math.max(0, Math.min(source.height - 1, sourceY - 0.5));
      const left = Math.floor(pixelX);
      const top = Math.floor(pixelY);
      const right = Math.min(source.width - 1, left + 1);
      const bottom = Math.min(source.height - 1, top + 1);
      const dx = pixelX - left;
      const dy = pixelY - top;
      const topLeft = (top * source.width + left) * 4;
      const topRight = (top * source.width + right) * 4;
      const bottomLeft = (bottom * source.width + left) * 4;
      const bottomRight = (bottom * source.width + right) * 4;
      const alphaTL = ((1 - dx) * (1 - dy) * input[topLeft + 3]!) / 255;
      const alphaTR = (dx * (1 - dy) * input[topRight + 3]!) / 255;
      const alphaBL = ((1 - dx) * dy * input[bottomLeft + 3]!) / 255;
      const alphaBR = (dx * dy * input[bottomRight + 3]!) / 255;
      const backdropWeight = 1 - alphaTL - alphaTR - alphaBL - alphaBR;
      const offset = (y * destination.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        output[offset + channel] =
          input[topLeft + channel]! * alphaTL +
          input[topRight + channel]! * alphaTR +
          input[bottomLeft + channel]! * alphaBL +
          input[bottomRight + channel]! * alphaBR +
          output[offset + channel]! * backdropWeight;
      }
    }
    if ((y + 1) % rowsPerChunk === 0 && y + 1 < destination.height) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}
