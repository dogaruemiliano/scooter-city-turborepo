import { z } from "zod";

export const rentalMediaEventSchema = z.enum(["handover", "return"]);
export const rentalMediaQuerySchema = z.strictObject({
  eventType: rentalMediaEventSchema,
});
export const rentalMediaUploadInputSchema = rentalMediaQuerySchema;
export const rentalMediaSchema = z.strictObject({
  id: z.string(),
  fileName: z.string(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  createdAt: z.iso.datetime(),
});
export const rentalMediaListSchema = z.strictObject({
  items: z.array(rentalMediaSchema),
});
export type RentalMediaEvent = z.infer<typeof rentalMediaEventSchema>;
export type RentalMedia = z.infer<typeof rentalMediaSchema>;
