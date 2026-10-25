import { v1 } from "@repo/api-shared";
import {
  CREATE_FIELDS,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import type { ScooterDocumentsSnapshot } from "./useScooterDocuments";
import type { ScooterAnalysisSnapshot } from "./useScooterDocumentAnalysis";
import type { ScooterPhotosSnapshot } from "./useScooterPhotos";
import type { ScooterExtractionSnapshot } from "./useScooterExtraction";

export type ScooterImportStatus =
  | "empty"
  | "uploading"
  | "queued"
  | "analysing"
  | "review"
  | "attention"
  | "ready"
  | "created";
export interface ScooterImportSnapshot {
  /** Retained for legacy saved drafts only; uploads are never reassigned. */
  assignment?: string;
  version: 1;
  values: ScooterEditorValues;
  documents: ScooterDocumentsSnapshot;
  analysis: ScooterAnalysisSnapshot;
  extraction: ScooterExtractionSnapshot;
  importedRawFields: Record<string, string> | null;
  importedSignature: string | null;
  automaticImport: string;
  /** Kept for older saved drafts; document review now happens in the scooter form. */
  reviewedDocuments: string[];
  createdBrands: v1.scooterBrands.ScooterBrand[];
  status: ScooterImportStatus;
  photos?: ScooterPhotosSnapshot;
  currentInsuranceSourceId?: string | null;
}

/** The persisted envelope is versioned; unknown versions never reach the editor. */
export function readScooterImportSnapshot(
  state: Record<string, unknown>,
): ScooterImportSnapshot | undefined {
  if (
    state.version !== 1 ||
    !state.values ||
    typeof state.values !== "object" ||
    !state.documents ||
    typeof state.documents !== "object" ||
    !state.analysis ||
    typeof state.analysis !== "object" ||
    !state.extraction ||
    typeof state.extraction !== "object"
  )
    return undefined;
  try {
    const value = state as unknown as ScooterImportSnapshot;
    if (
      !Array.isArray(value.documents.drafts) ||
      !Array.isArray(value.documents.removedIds) ||
      !value.documents.extractions ||
      !Array.isArray(value.analysis.cache) ||
      !Array.isArray(value.analysis.attempts) ||
      !value.analysis.entries ||
      !Array.isArray(value.extraction.confirmedSources) ||
      !Array.isArray(value.extraction.origins) ||
      !Array.isArray(value.reviewedDocuments) ||
      !Array.isArray(value.createdBrands)
    )
      return undefined;
    if (
      CREATE_FIELDS.some(
        (field) =>
          value.values[field] !== undefined &&
          typeof value.values[field] !== "string",
      ) ||
      value.documents.drafts.some(
        (draft) =>
          !draft ||
          typeof draft.id !== "string" ||
          !draft.file ||
          typeof draft.file.name !== "string" ||
          typeof draft.file.type !== "string" ||
          !Number.isSafeInteger(draft.file.size) ||
          draft.file.size < 0 ||
          !Number.isFinite(draft.file.lastModified),
      ) ||
      value.analysis.cache.some(
        (entry) =>
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          entry.some((part) => typeof part !== "string"),
      ) ||
      Object.values(value.analysis.entries).some(
        (entry) =>
          !entry ||
          !["processing", "success", "failed"].includes(entry.status) ||
          (entry.status === "success" &&
            !v1.scooters.scooterDocumentAnalysisSchema.safeParse(entry.analysis)
              .success),
      ) ||
      value.analysis.attempts.some(
        (attempt) =>
          !attempt ||
          typeof attempt.key !== "string" ||
          !Number.isFinite(attempt.deadline) ||
          !v1.scooters.startScooterDocumentExtractionJobInputSchema.safeParse(
            attempt.input,
          ).success ||
          (attempt.job &&
            !v1.scooters.scooterDocumentExtractionJobSchema.safeParse(
              attempt.job,
            ).success),
      )
    )
      return undefined;
    if (
      value.photos &&
      (!Array.isArray(value.photos.photos) ||
        !Array.isArray(value.photos.uploads) ||
        value.photos.photos.length + value.photos.uploads.length >
          v1.scooters.SCOOTER_PHOTO_MAX_FILES ||
        value.photos.photos.some(
          (photo) =>
            !photo ||
            typeof photo.id !== "string" ||
            !v1.scooters.scooterPhotoDraftSchema.safeParse(photo).success,
        ) ||
        value.photos.uploads.some(
          (upload) =>
            !upload ||
            typeof upload.id !== "string" ||
            !upload.file ||
            typeof upload.file.name !== "string" ||
            typeof upload.file.type !== "string" ||
            !Number.isSafeInteger(upload.file.size) ||
            upload.file.size < 0 ||
            !Number.isFinite(upload.file.lastModified),
        ))
    )
      return undefined;
    value.values = { ...scooterEditorDefaults(), ...value.values };
    value.documents.extractions = {
      ...Object.fromEntries(
        Object.entries(value.analysis.entries).flatMap(([id, entry]) =>
          entry.status === "success"
            ? [[id, entry.analysis.extractedData]]
            : [],
        ),
      ),
      ...value.documents.extractions,
    };
    return value;
  } catch {
    return undefined;
  }
}

/** Store repeated extraction evidence once; uploads never serialize their File bytes. */
export function compactScooterImportSnapshot(
  snapshot: ScooterImportSnapshot,
): ScooterImportSnapshot {
  return {
    ...snapshot,
    documents: {
      ...snapshot.documents,
      extractions: Object.fromEntries(
        Object.entries(snapshot.documents.extractions).filter(([id, data]) => {
          const state = snapshot.analysis.entries[id];
          return (
            state?.status !== "success" ||
            JSON.stringify(state.analysis.extractedData) !==
              JSON.stringify(data)
          );
        }),
      ),
    },
    extraction: {
      ...snapshot.extraction,
      ...(snapshot.extraction.reviewResult
        ? {
            reviewResult: {
              ...snapshot.extraction.reviewResult,
              extractedDocuments: undefined,
            },
          }
        : {}),
    },
  };
}

/** PostgreSQL JSON objects need not preserve key order. Compare state by value. */
export function scooterImportStateSignature(state: unknown): string {
  return JSON.stringify(state, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : value,
  );
}
