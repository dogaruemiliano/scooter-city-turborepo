import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Inspect dimensions before decoding to bound memory, then re-encode trusted raster bytes. */
function dimensions(bytes: Buffer): {
  width: number;
  height: number;
  type: "image/png" | "image/jpeg";
} {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(PNG) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  )
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      type: "image/png",
    };
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let position = 2;
    while (position + 4 < bytes.length) {
      if (bytes[position++] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = bytes.readUInt16BE(position);
      if (length < 2 || position + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return {
          width: bytes.readUInt16BE(position + 5),
          height: bytes.readUInt16BE(position + 3),
          type: "image/jpeg",
        };
      position += length;
    }
  }
  throw new BadRequestException("Only a real PNG or JPEG image is accepted");
}

export async function sanitizeSigningImage(
  bytes: Buffer,
  signature: boolean,
  purpose: "selfie" | "branding" = "selfie",
): Promise<Buffer> {
  if (
    !bytes.length ||
    bytes.length > (signature ? 2 * 1024 * 1024 : 8 * 1024 * 1024)
  )
    throw new PayloadTooLargeException("Image exceeds the permitted size");
  const { width, height, type } = dimensions(bytes);
  if (signature && type !== "image/png")
    throw new BadRequestException("Signature must be a PNG");
  const maxPixels = signature
    ? 2_000_000
    : purpose === "branding"
      ? 4_000_000
      : 12_000_000;
  if (
    width < (signature ? 20 : purpose === "branding" ? 1 : 200) ||
    height < (signature ? 10 : purpose === "branding" ? 1 : 200) ||
    width > (signature ? 2048 : 8192) ||
    height > (signature ? 2048 : 8192) ||
    width * height > maxPixels
  )
    throw new BadRequestException("Invalid image dimensions");
  try {
    const image = await loadImage(bytes);
    if (image.width !== width || image.height !== height)
      throw new Error("Dimensions differ");
    const canvas = createCanvas(width, height),
      ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    if (signature) {
      const { data } = ctx.getImageData(0, 0, width, height);
      let count = 0,
        minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * 4;
        if (
          data[offset + 3] > 80 &&
          (data[offset] + data[offset + 1] + data[offset + 2]) / 3 < 220
        ) {
          count++;
          const x = pixel % width,
            y = Math.floor(pixel / width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (count < 20 || maxX - minX < 8 || maxY - minY < 4)
        throw new BadRequestException("Draw a signature before continuing");
    }
    return await canvas.encode("png");
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("Image could not be decoded safely");
  }
}

export async function signatureDataUrl(value: string): Promise<Buffer> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new BadRequestException("A PNG signature is required");
  return sanitizeSigningImage(Buffer.from(match[1], "base64"), true);
}
