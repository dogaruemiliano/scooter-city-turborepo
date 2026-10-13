import { z } from "zod";

export const SCOOTER_PHOTO_MAX_FILES = 20;
export const SCOOTER_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const SCOOTER_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Rental evidence is stored separately and is never part of gallery endpoints. */
export const SCOOTER_PHOTO_TYPES = [
  "GALLERY",
  "GALLERY_COVER",
  "RENTAL_BEFORE",
  "RENTAL_AFTER",
] as const;
export const SCOOTER_GALLERY_PHOTO_TYPES = [
  "GALLERY",
  "GALLERY_COVER",
] as const;
export const scooterPhotoTypeSchema = z.enum(SCOOTER_PHOTO_TYPES);
export type ScooterPhotoType = z.infer<typeof scooterPhotoTypeSchema>;

export const scooterPhotoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  caption: z.string().nullable(),
  isPublic: z.boolean(),
  type: z.enum(SCOOTER_GALLERY_PHOTO_TYPES),
  position: z.number().int().nonnegative(),
  contentUrl: z.string(),
  createdAt: z.string(),
});
export const scooterPhotoListSchema = z.array(scooterPhotoSchema);
export type ScooterPhoto = z.infer<typeof scooterPhotoSchema>;

export const createScooterPhotoUploadSchema = z.object({
  contentType: z.enum(SCOOTER_PHOTO_CONTENT_TYPES),
  byteSize: z.number().int().positive().max(SCOOTER_PHOTO_MAX_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type CreateScooterPhotoUpload = z.infer<
  typeof createScooterPhotoUploadSchema
>;
export const scooterPhotoUploadSchema = z.object({
  uploadUrl: z.string().url(),
  uploadToken: z.string(),
  headers: z.record(z.string(), z.string()),
  maxBytes: z.number(),
});
export const attachScooterPhotoSchema = z.object({
  uploadToken: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
});
export type AttachScooterPhoto = z.infer<typeof attachScooterPhotoSchema>;
export const scooterPhotoDraftSchema = attachScooterPhotoSchema.extend({
  caption: z.string().trim().max(500).nullable(),
  isPublic: z.boolean(),
  type: z.enum(SCOOTER_GALLERY_PHOTO_TYPES),
});
export type ScooterPhotoDraft = z.infer<typeof scooterPhotoDraftSchema>;
export const scooterPhotoDraftsSchema = z
  .array(scooterPhotoDraftSchema)
  .max(SCOOTER_PHOTO_MAX_FILES)
  .refine(
    (photos) =>
      new Set(photos.map((photo) => photo.uploadToken)).size === photos.length,
    "Duplicate photo upload",
  )
  .refine(
    (photos) =>
      photos.filter((photo) => photo.type === "GALLERY_COVER").length <= 1,
    "Only one gallery cover is allowed",
  );
export const updateScooterPhotoSchema = z.object({
  caption: z.string().trim().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
  type: z.literal("GALLERY_COVER").optional(),
});
export type UpdateScooterPhoto = z.infer<typeof updateScooterPhotoSchema>;
export const reorderScooterPhotosSchema = z.object({
  photoIds: z
    .array(z.string().min(1))
    .max(SCOOTER_PHOTO_MAX_FILES)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate photo IDs"),
});
