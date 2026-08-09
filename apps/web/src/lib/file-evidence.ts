"use client";

export interface FileEvidenceReference {
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  imageWidth?: number;
  imageHeight?: number;
  pageCount?: number;
}

export interface SelectedFileEvidence extends FileEvidenceReference {
  file: File;
}

export async function prepareFileEvidence(
  file: File,
  options: { allowedContentTypes: readonly string[]; maxBytes: number },
): Promise<SelectedFileEvidence> {
  if (!options.allowedContentTypes.includes(file.type)) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (file.size > options.maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const mediaMetadata =
    file.type === "application/pdf"
      ? { pageCount: countPdfPages(bytes) }
      : await imageDimensions(file);

  return {
    file,
    fileName: file.name,
    contentType: file.type,
    byteSize: file.size,
    sha256,
    ...mediaMetadata,
  };
}

async function imageDimensions(
  file: File,
): Promise<{ imageWidth: number; imageHeight: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { imageWidth: bitmap.width, imageHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function countPdfPages(bytes: ArrayBuffer): number {
  const content = new TextDecoder("latin1").decode(bytes);
  const pageObjects = content.match(/\/Type\s*\/Page(?!s)\b/g);
  return Math.max(1, pageObjects?.length ?? 0);
}
