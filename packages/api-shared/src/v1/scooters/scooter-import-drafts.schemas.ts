import { z } from "zod";

export const SCOOTER_IMPORT_MAX_DRAFTS = 20;
export const SCOOTER_IMPORT_DRAFT_MAX_STATE_BYTES = 512_000;

/** JSON editor snapshots contain metadata and review state, never document bytes. */
export const scooterImportDraftStateSchema = z
  .record(z.string(), z.unknown())
  .refine((state) => {
    try {
      const serialized = JSON.stringify(state, (_key, value: unknown) => {
        if (
          ["undefined", "bigint", "function", "symbol"].includes(
            typeof value,
          ) ||
          (typeof value === "number" && !Number.isFinite(value))
        )
          throw new Error("Draft state must contain JSON values.");
        return value;
      });
      return (
        new TextEncoder().encode(serialized).byteLength <=
        SCOOTER_IMPORT_DRAFT_MAX_STATE_BYTES
      );
    } catch {
      return false;
    }
  }, "The scooter import draft must contain JSON values within the size limit.")
  .meta({ id: "ScooterImportDraftState" });

export const createScooterImportDraftSchema = z
  .object({})
  .strict()
  .meta({ id: "CreateScooterImportDraft" });

export const scooterImportDraftPhotoContentInputSchema = z
  .object({ uploadToken: z.string().min(1).max(8192) })
  .strict()
  .meta({ id: "ScooterImportDraftPhotoContentInput" });

export const updateScooterImportDraftSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    state: scooterImportDraftStateSchema,
  })
  .strict()
  .meta({ id: "UpdateScooterImportDraft" });
export type UpdateScooterImportDraftInput = z.infer<
  typeof updateScooterImportDraftSchema
>;

export const scooterImportDraftSchema = z
  .object({
    id: z.string().min(1).max(120),
    expiresAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().nonnegative(),
    state: scooterImportDraftStateSchema,
  })
  .strict()
  .meta({ id: "ScooterImportDraft" });
export type ScooterImportDraft = z.infer<typeof scooterImportDraftSchema>;

export const scooterImportDraftListSchema = z
  .object({
    items: z.array(scooterImportDraftSchema).max(SCOOTER_IMPORT_MAX_DRAFTS),
  })
  .strict()
  .meta({ id: "ScooterImportDraftList" });
export type ScooterImportDraftList = z.infer<
  typeof scooterImportDraftListSchema
>;

export const mergeScooterImportDraftSchema = z
  .object({
    sourceId: z.string().min(1).max(120),
    sourceRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    state: scooterImportDraftStateSchema,
  })
  .strict()
  .meta({ id: "MergeScooterImportDraft" });
export type MergeScooterImportDraftInput = z.infer<
  typeof mergeScooterImportDraftSchema
>;
