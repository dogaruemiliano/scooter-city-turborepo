import { deflateRawSync, inflateRawSync } from "node:zlib";

export class TemplateEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateEngineError";
  }
}

export const DOCX_LIMITS = {
  compressedBytes: 10 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  entryBytes: 12 * 1024 * 1024,
  entries: 256,
} as const;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validName(name: string): boolean {
  return (
    Boolean(name) &&
    !name.startsWith("/") &&
    !/[\\:]/.test(name) &&
    !Array.from(name).some((character) => character.charCodeAt(0) < 32) &&
    !name.split("/").some((part) => part === ".." || part === "." || !part)
  );
}

/** Bounded ZIP reader: no extraction to disk, no ZIP64, encryption, traversal or duplicate entries. */
export function readDocxZip(input: Buffer): Map<string, Buffer> {
  if (
    input.length < 22 ||
    input.length > DOCX_LIMITS.compressedBytes ||
    input.readUInt32LE(0) !== 0x04034b50
  ) {
    throw new TemplateEngineError(
      "DOCX file size is outside the supported limits.",
    );
  }
  let end = -1;
  for (
    let at = input.length - 22;
    at >= Math.max(0, input.length - 65557);
    at--
  ) {
    if (
      input.readUInt32LE(at) === 0x06054b50 &&
      at + 22 + input.readUInt16LE(at + 20) === input.length
    ) {
      end = at;
      break;
    }
  }
  if (end < 0 || input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6)) {
    throw new TemplateEngineError("Invalid or multipart DOCX ZIP.");
  }
  const count = input.readUInt16LE(end + 10);
  const centralBytes = input.readUInt32LE(end + 12);
  const centralStart = input.readUInt32LE(end + 16);
  if (
    count > DOCX_LIMITS.entries ||
    count !== input.readUInt16LE(end + 8) ||
    centralStart + centralBytes !== end
  ) {
    throw new TemplateEngineError("Unsupported DOCX ZIP directory.");
  }
  const output = new Map<string, Buffer>();
  let at = centralStart;
  let total = 0;
  const ranges: Array<[number, number]> = [];
  try {
    for (let index = 0; index < count; index++) {
      if (at + 46 > end || input.readUInt32LE(at) !== 0x02014b50)
        throw new Error();
      const flags = input.readUInt16LE(at + 8);
      const method = input.readUInt16LE(at + 10);
      const checksum = input.readUInt32LE(at + 16);
      const compressed = input.readUInt32LE(at + 20);
      const expanded = input.readUInt32LE(at + 24);
      const nameBytes = input.readUInt16LE(at + 28);
      const extraBytes = input.readUInt16LE(at + 30);
      const commentBytes = input.readUInt16LE(at + 32);
      const local = input.readUInt32LE(at + 42);
      const name = input
        .subarray(at + 46, at + 46 + nameBytes)
        .toString("utf8");
      at += 46 + nameBytes + extraBytes + commentBytes;
      total += expanded;
      if (
        at > end ||
        !validName(name) ||
        output.has(name) ||
        flags & ~0x080e ||
        flags & 1 ||
        ![0, 8].includes(method) ||
        expanded > DOCX_LIMITS.entryBytes ||
        total > DOCX_LIMITS.expandedBytes ||
        local + 30 > centralStart ||
        input.readUInt32LE(local) !== 0x04034b50
      )
        throw new Error();
      const localNameBytes = input.readUInt16LE(local + 26);
      const start =
        local + 30 + localNameBytes + input.readUInt16LE(local + 28);
      if (
        input.readUInt16LE(local + 6) !== flags ||
        input.readUInt16LE(local + 8) !== method ||
        input
          .subarray(local + 30, local + 30 + localNameBytes)
          .toString("utf8") !== name ||
        start + compressed > centralStart
      )
        throw new Error();
      if (ranges.some(([from, to]) => local < to && start + compressed > from))
        throw new Error();
      ranges.push([local, start + compressed]);
      const bytes = input.subarray(start, start + compressed);
      const data =
        method === 0
          ? Buffer.from(bytes)
          : inflateRawSync(bytes, { maxOutputLength: DOCX_LIMITS.entryBytes });
      if (data.length !== expanded || crc32(data) !== checksum)
        throw new Error();
      output.set(name, data);
    }
    if (at !== end) throw new Error();
  } catch {
    throw new TemplateEngineError(
      "Invalid, unsafe or oversized DOCX ZIP entry.",
    );
  }
  if (
    !output.has("[Content_Types].xml") ||
    !output.has("word/document.xml") ||
    !output.has("_rels/.rels")
  ) {
    throw new TemplateEngineError("The upload is not a Word DOCX document.");
  }
  return output;
}

/** Deterministic ZIP writer for validated OOXML entries; fixed DOS timestamp, stable ordering. */
export function writeDocxZip(entries: ReadonlyMap<string, Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of [...entries].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!validName(name))
      throw new TemplateEngineError("Invalid ZIP output name.");
    const nameBuffer = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, nameBuffer, compressed);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}
