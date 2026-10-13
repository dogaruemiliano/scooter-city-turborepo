import { z } from "zod";

export const SCOOTER_PHOTO_MAX_FILES = 20;
export const SCOOTER_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const SCOOTER_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const scooterPhotoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  caption: z.string().nullable(),
  showToCustomers: z.boolean(),
  internalCover: z.boolean(),
  customerCover: z.boolean(),
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
  showToCustomers: z.boolean(),
  internalCover: z.boolean(),
  customerCover: z.boolean(),
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
      photos.filter((photo) => photo.internalCover).length <= 1 &&
      photos.filter((photo) => photo.customerCover).length <= 1,
    "Only one cover per audience is allowed",
  )
  .refine(
    (photos) =>
      photos.every((photo) => !photo.customerCover || photo.showToCustomers),
    "Customer cover must be selected for customers",
  );
export const updateScooterPhotoSchema = z.object({
  caption: z.string().trim().max(500).nullable().optional(),
  showToCustomers: z.boolean().optional(),
  internalCover: z.literal(true).optional(),
  customerCover: z.literal(true).optional(),
});
export type UpdateScooterPhoto = z.infer<typeof updateScooterPhotoSchema>;
export const reorderScooterPhotosSchema = z.object({
  photoIds: z
    .array(z.string().min(1))
    .max(SCOOTER_PHOTO_MAX_FILES)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate photo IDs"),
});
