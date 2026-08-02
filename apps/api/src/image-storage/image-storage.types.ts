import type { Readable } from "node:stream";

export const IMAGE_STORAGE_PROVIDER_S3 = "s3" as const;

export const SUPPORTED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SUPPORTED_DOCUMENT_CONTENT_TYPES = [
  ...SUPPORTED_IMAGE_CONTENT_TYPES,
  "application/pdf",
] as const;

export type SupportedImageContentType =
  (typeof SUPPORTED_IMAGE_CONTENT_TYPES)[number];

export type SupportedDocumentContentType =
  (typeof SUPPORTED_DOCUMENT_CONTENT_TYPES)[number];

export interface StoreImageInput {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
}

export interface PresignImageUploadInput {
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  scope: string;
}

export interface PresignDocumentUploadInput extends PresignImageUploadInput {
  imageWidth?: number | null;
  imageHeight?: number | null;
  pageCount?: number | null;
}

export interface StoredImage {
  provider: typeof IMAGE_STORAGE_PROVIDER_S3;
  bucket: string;
  storageKey: string;
  contentType: SupportedImageContentType;
  byteSize: number;
  checksumSha256: string;
}

export interface StoredDocument {
  provider: typeof IMAGE_STORAGE_PROVIDER_S3;
  bucket: string;
  storageKey: string;
  contentType: SupportedDocumentContentType;
  byteSize: number;
  checksumSha256: string;
  imageWidth: number | null;
  imageHeight: number | null;
  pageCount: number | null;
}

export interface ReadStoredImageResult {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
}

export interface PresignedImageUpload {
  provider: typeof IMAGE_STORAGE_PROVIDER_S3;
  bucket: string;
  storageKey: string;
  uploadUrl: string;
  uploadToken: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
  maxBytes: number;
}

export type PresignedDocumentUpload = PresignedImageUpload;
