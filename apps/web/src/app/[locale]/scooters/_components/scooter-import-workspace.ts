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

/** Group by independently read vehicle identity, never by filenames or upload order. */
export function scooterImportIdentity(
  snapshot: ScooterImportSnapshot,
): string | null {
  const readings = Object.values(snapshot.analysis.entries)
    .flatMap((entry) => {
      if (entry.status !== "success") return [];
      const documents = entry.analysis.extractedData.documents;
      return documents?.length
        ? documents
        : [
            {
              documentType: entry.analysis.documentType,
              vin: entry.analysis.extractedData.vin,
            },
          ];
    })
    .filter(
      (document) =>
        v1.scooters.scooterDocumentReadsVin(document.documentType) &&
        document.vin,
    );
  return new Set(readings.map((document) => document.vin)).size === 1
    ? v1.scooters.preferredScooterDocumentVin(readings)
    : null;
}

/** The destination keeps its edits; new evidence is replayed through the normal form importer. */
export function mergeScooterImportSnapshots(
  target: ScooterImportSnapshot,
  source: ScooterImportSnapshot,
): ScooterImportSnapshot {
  const policyId =
    target.documents.drafts.find((draft) => draft.insurancePolicyId)
      ?.insurancePolicyId ??
    source.documents.drafts.find((draft) => draft.insurancePolicyId)
      ?.insurancePolicyId;
  return {
    ...target,
    documents: {
      drafts: [...target.documents.drafts, ...source.documents.drafts].map(
        (draft) =>
          draft.insurancePolicyId && policyId
            ? { ...draft, insurancePolicyId: policyId }
            : draft,
      ),
      extractions: {
        ...source.documents.extractions,
        ...target.documents.extractions,
      },
      removedIds: [
        ...new Set([
          ...target.documents.removedIds,
          ...source.documents.removedIds,
        ]),
      ],
    },
    analysis: {
      entries: { ...source.analysis.entries, ...target.analysis.entries },
      attempts: [],
      cache: [...target.analysis.cache, ...source.analysis.cache],
    },
    reviewedDocuments: [
      ...target.reviewedDocuments,
      ...source.reviewedDocuments,
    ],
    createdBrands: [
      ...new Map(
        [...source.createdBrands, ...target.createdBrands].map((brand) => [
          brand.id,
          brand,
        ]),
      ).values(),
    ],
    automaticImport: "",
    importedSignature: null,
    status: "review",
  };
}

/** Never discard edits made in a secondary draft while grouping its files. */
export function scooterImportHasManualValues(
  snapshot: ScooterImportSnapshot,
): boolean {
  if (snapshot.extraction.manual.length) return true;
  const defaults = scooterEditorDefaults();
  const origins = new Map(snapshot.extraction.origins);
  return Object.entries(snapshot.values).some(([field, value]) => {
    if (field === "insurancePolicies") {
      return (
        snapshot.values.insurancePolicies?.some((policy) =>
          v1.scooters.INSURANCE_FIELDS.some((key) => {
            const actual = policy[key];
            const origin = origins.get(`policy:${policy.id}:${key}`);
            return actual && actual !== origin?.lastAuto;
          }),
        ) ?? false
      );
    }
    if (value === defaults[field as keyof typeof defaults]) return false;
    const origin = origins.get(field);
    if (origin) return value !== origin.lastAuto;
    if (
      field === "civAvailability" &&
      value === "issued" &&
      Object.values(snapshot.analysis.entries).some(
        (entry) =>
          entry.status === "success" &&
          (entry.analysis.documentType === "civ" ||
            entry.analysis.extractedData.documents?.some(
              (document) => document.documentType === "civ",
            )),
      )
    )
      return false;
    return value !== "" && value !== undefined;
  });
}
