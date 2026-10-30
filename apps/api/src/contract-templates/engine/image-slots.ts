import { TemplateEngineError } from "./zip";

export interface TemplateImageValue {
  readonly kind: "image";
  /** Bytes retrieved from authorized private storage; arbitrary URL fetching is never supported. */
  readonly bytes: Buffer;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly alt: string;
}
export function imageDimensions(image: TemplateImageValue): {
  width: number;
  height: number;
} {
  const bytes = image.bytes;
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 2 * 1024 * 1024 ||
    !image.alt ||
    image.alt.includes("${") ||
    image.alt.length > 200
  )
    throw new TemplateEngineError("Invalid image slot value.");
  let width = 0;
  let height = 0;
  if (
    image.mimeType === "image/png" &&
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    let at = 8;
    let ended = false;
    while (at + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(at);
      if (at + 12 + size > bytes.length)
        throw new TemplateEngineError("Truncated PNG image.");
      const kind = bytes.toString("ascii", at + 4, at + 8);
      at += 12 + size;
      if (kind === "IEND") {
        ended = size === 0 && at === bytes.length;
        break;
      }
    }
    if (!ended) throw new TemplateEngineError("Invalid PNG image.");
  } else if (
    image.mimeType === "image/jpeg" &&
    bytes.length >= 4 &&
    bytes.readUInt16BE(0) === 0xffd8 &&
    bytes.readUInt16BE(bytes.length - 2) === 0xffd9
  ) {
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at] !== 0xff) break;
      const marker = bytes[at + 1];
      const length = bytes.readUInt16BE(at + 2);
      if (length < 2 || at + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(at + 5);
        width = bytes.readUInt16BE(at + 7);
        break;
      }
      at += 2 + length;
    }
  }
  if (
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 8_000_000
  )
    throw new TemplateEngineError(
      "Only bounded real PNG/JPEG image slots are supported.",
    );
  return { width, height };
}
