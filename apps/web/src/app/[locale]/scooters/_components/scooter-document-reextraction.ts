import { v1 } from "@repo/api-shared";
import { prepareScooterAnalysisImport } from "./scooter-analysis-import";
import type { DocumentImportResult } from "./scooter-document-import";
import type {
  ScooterEditorField,
  ScooterEditorValues,
} from "./scooter-editor-schema";

type Evidence = v1.scooters.ScooterDocumentExtractedData;
type Success = Extract<DocumentImportResult, { ok: true }>;
export type ReextractionProposal = {
  id: string;
  kind: "field" | "policy" | "raw" | "document";
  field: string;
  policyId?: string;
  previous: string;
  next: string;
  sourceIds: string[];
  preselected: boolean;
  blocked?: boolean;
};
const meaningful = (value: unknown) =>
  value != null && String(value).trim() !== "";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

function evidenceSnapshot(value: Evidence) {
  const copy = { ...value };
  delete copy.reextractionHistory;
  return copy;
}

/** Keep old evidence, manual classifications and unreadable values intact. */
export function mergeReextractedEvidence(
  previous: Evidence | null | undefined,
  incoming: Evidence,
): Evidence {
  if (!previous) return incoming;
  function mergeRecord<T>(old: Record<string, T>, next: Record<string, T>) {
    return {
      ...old,
      ...Object.fromEntries(
        Object.entries(next).filter(([, value]) => meaningful(value)),
      ),
    };
  }
  const documents = [...(previous.documents ?? [])];
  for (const next of incoming.documents ?? []) {
    // IDs and suggested crop coordinates can change between runs. A unique
    // document of this type on these pages still refers to the original record.
    const samePages = (old: v1.scooters.LogicalDocumentExtraction) =>
      old.documentType === next.documentType &&
      stableJson(old.pages) === stableJson(next.pages);
    const uniquePageMatch =
      documents.filter(samePages).length === 1 &&
      incoming.documents!.filter(samePages).length === 1;
    const index = documents.findIndex(
      (old) =>
        samePages(old) &&
        (uniquePageMatch ||
          stableJson(old.regions ?? []) === stableJson(next.regions ?? [])),
    );
    const old = documents[index];
    if (!old) documents.push(next);
    else
      documents[index] = {
        ...old,
        vin: old.vinReview ? old.vin : (next.vin ?? old.vin),
        fields: mergeRecord(old.fields, next.fields),
        rawFields: mergeRecord(old.rawFields, next.rawFields),
        issues: next.issues,
        // Existing inspection readings stay available; exact repeated rows are deduplicated.
        ...(old.inspections?.length || next.inspections?.length
          ? {
              inspections: [
                ...(old.inspections ?? []),
                ...(next.inspections ?? []),
              ].filter(
                (row, position, rows) =>
                  rows.findIndex(
                    (other) => stableJson(other) === stableJson(row),
                  ) === position,
              ),
            }
          : {}),
      };
  }
  return {
    ...previous,
    vin: previous.vinReview ? previous.vin : (incoming.vin ?? previous.vin),
    fields: mergeRecord(previous.fields, incoming.fields),
    rawFields: mergeRecord(previous.rawFields, incoming.rawFields),
    ...(documents.length ? { documents } : {}),
    // An unassigned policy must not silently become the current policy.
    ...(previous.currentInsuranceDocumentId === undefined &&
    documents.some((document) => document.documentType === "insurance")
      ? { currentInsuranceDocumentId: null }
      : {}),
  };
}

export function reextractionReview(
  analyses: v1.scooters.ScooterDocumentAnalysis[],
  files: v1.scooters.ScooterDocument[],
  brands: Pick<v1.scooterBrands.ScooterBrand, "id" | "name">[],
  current: ScooterEditorValues,
  baseline: ScooterEditorValues,
  raw: Record<string, string>,
  dirty: (field: ScooterEditorField) => boolean,
) {
  // Exclude a mismatched source entirely, retaining usable results from other files.
  const rejected = analyses.filter((analysis) => {
    const readings = analysis.extractedData.documents?.length
      ? analysis.extractedData.documents
      : [
          {
            documentType: analysis.documentType,
            vin: analysis.extractedData.vin,
          },
        ];
    const vins = readings
      .filter((reading) =>
        v1.scooters.scooterDocumentReadsVin(reading.documentType),
      )
      .flatMap((reading) => (reading.vin ? [reading.vin] : []));
    return (
      new Set([...vins, ...(current.vin ? [current.vin.toUpperCase()] : [])])
        .size > 1
    );
  });
  const usable = analyses.filter(
    (analysis) =>
      !rejected.includes(analysis) &&
      files.some((file) => file.id === analysis.sourceId),
  );
  const sources = files.map((file) => ({
    sourceId: file.id,
    type: file.type,
    fileName: file.fileName,
    insurancePolicyId: file.insurancePolicyId,
  }));
  // Existing policy associations are authoritative. New/unassigned policies remain
  // document evidence for the separate insurance review, like ITP inspections.
  const selectedInsuranceSourceIds = usable.flatMap((analysis) => {
    const file = files.find((file) => file.id === analysis.sourceId)!;
    if (
      !file.insurancePolicyId ||
      !current.insurancePolicies?.some(
        (policy) => policy.id === file.insurancePolicyId,
      )
    )
      return [];
    const children =
      analysis.extractedData.documents?.filter(
        (document) => document.documentType === "insurance",
      ) ?? [];
    return children.length === 1
      ? [`${file.id}:${children[0]!.id}`]
      : children.length
        ? []
        : [file.id];
  });
  const result = prepareScooterAnalysisImport(
    usable,
    sources,
    brands,
    current,
    true,
    {
      currentInsuranceSourceId: null,
      currentInsuranceSourceIds: selectedInsuranceSourceIds,
    },
  );
  const proposals: ReextractionProposal[] = [];
  if (!result.ok)
    return {
      result,
      proposals,
      rejected: rejected.map((analysis) => analysis.sourceId),
    };
  for (const [field, next] of Object.entries(result.values)) {
    const key = field as ScooterEditorField;
    const previous = current[key] ?? "";
    if (!meaningful(next) || next === previous) continue;
    proposals.push({
      id: `field:${field}`,
      kind: "field",
      field,
      previous,
      next,
      sourceIds: result.fieldSources?.[field] ?? [],
      preselected:
        !previous &&
        !baseline[key] &&
        !dirty(key) &&
        !result.unresolved.includes(field),
      blocked:
        result.unresolved.includes(field) ||
        (field === "powertrainType" &&
          next !== current.powertrainType &&
          v1.scooters
            .inactivePowertrainFields(next)
            .some((field) => meaningful(current[field as ScooterEditorField]))),
    });
  }
  for (const policy of result.insurancePolicies ?? []) {
    const old = current.insurancePolicies?.find(
      (item) => item.id === policy.id,
    );
    if (!old) continue;
    for (const field of v1.scooters.INSURANCE_FIELDS) {
      const next = policy[field];
      if (!meaningful(next) || next === old[field]) continue;
      proposals.push({
        id: `policy:${policy.id}:${field}`,
        kind: "policy",
        policyId: policy.id,
        field,
        previous: old[field],
        next,
        preselected: false,
        sourceIds: files
          .filter((file) => file.insurancePolicyId === policy.id)
          .map((file) => file.id),
        blocked: result.unresolvedInsuranceFields?.[policy.id]?.includes(field),
      });
    }
  }
  for (const [field, next] of Object.entries(result.rawFields ?? {})) {
    const previous = raw[field] ?? "";
    if (!meaningful(next) || next === previous) continue;
    proposals.push({
      id: `raw:${field}`,
      kind: "raw",
      field,
      previous,
      next,
      sourceIds: usable
        .filter(
          (analysis) =>
            analysis.documentType === "civ" ||
            analysis.extractedData.documents?.some(
              (document) => document.documentType === "civ",
            ),
        )
        .map((analysis) => analysis.sourceId),
      preselected: !previous && !result.unresolvedRawFields.includes(field),
      blocked: result.unresolvedRawFields.includes(field),
    });
  }
  const evidence: Record<string, Evidence> = {};
  for (const analysis of usable) {
    const file = files.find((file) => file.id === analysis.sourceId)!;
    const old = evidenceSnapshot(
      file.extractedData ?? {
        vin: null,
        fields: {},
        rawFields: {},
      },
    );
    const next = evidenceSnapshot(
      mergeReextractedEvidence(file.extractedData, analysis.extractedData),
    );
    if (stableJson(old) === stableJson(next)) continue;
    evidence[file.id] = next;
    proposals.push({
      id: `document:${file.id}`,
      kind: "document",
      field: file.fileName,
      previous: stableJson(old),
      next: stableJson(next),
      sourceIds: [file.id],
      preselected: !file.extractedData,
      blocked:
        (file.extractedData?.reextractionHistory?.length ?? 0) >= 20 ||
        !v1.scooters.scooterDocumentExtractedDataSchema.safeParse(next).success,
    });
  }
  for (const proposal of proposals)
    if (
      proposal.sourceIds.some(
        (id) =>
          (files.find((file) => file.id === id)?.extractedData
            ?.reextractionHistory?.length ?? 0) >= 20,
      )
    ) {
      proposal.blocked = true;
      proposal.preselected = false;
    }
  return {
    result,
    proposals,
    evidence,
    rejected: rejected.map((analysis) => analysis.sourceId),
  };
}

/** Re-check the displayed value at apply time: stale selections cannot overwrite edits. */
export function selectedReextraction(
  proposals: ReextractionProposal[],
  selected: Record<string, { previous: string; next: string }>,
  raw: Record<string, string>,
  evidence: Record<string, Evidence>,
  files: v1.scooters.ScooterDocument[],
  current: ScooterEditorValues,
): Success {
  const result: Success = {
    ok: true,
    values: {},
    confirmedEmpty: [],
    unresolved: [],
    unresolvedRawFields: [],
    emptyConflicts: [],
  };
  const changesBySource = new Map<
    string,
    { field: string; previous: string; next: string }[]
  >();
  for (const proposal of proposals) {
    const choice = selected[proposal.id];
    if (
      !choice ||
      proposal.blocked ||
      choice.previous !== proposal.previous ||
      choice.next !== proposal.next
    )
      continue;
    if (proposal.kind === "field")
      result.values[proposal.field as ScooterEditorField] = proposal.next;
    if (proposal.kind === "policy") {
      result.insurancePolicies ??= structuredClone(
        current.insurancePolicies ?? [],
      );
      const policy = result.insurancePolicies.find(
        (item) => item.id === proposal.policyId,
      );
      if (policy)
        policy[
          proposal.field as (typeof v1.scooters.INSURANCE_FIELDS)[number]
        ] = proposal.next;
    }
    if (proposal.kind === "raw")
      (result.rawFields ??= { ...raw })[proposal.field] = proposal.next;
    if (proposal.kind !== "document") {
      for (const id of proposal.sourceIds) {
        const changes = changesBySource.get(id) ?? [];
        changes.push({
          field: proposal.id,
          previous: proposal.previous,
          next: proposal.next,
        });
        changesBySource.set(id, changes);
      }
    }
    if (proposal.kind === "document") {
      const id = proposal.sourceIds[0]!;
      const previous = files.find((file) => file.id === id)?.extractedData;
      const { reextractionHistory, ...old } = previous ?? {
        vin: null,
        fields: {},
        rawFields: {},
      };
      (result.extractedDocuments ??= {})[id] = {
        ...evidence[id]!,
        reextractionHistory: [
          ...(reextractionHistory ?? []),
          {
            analyzedAt: new Date().toISOString(),
            evidence: previous ? old : null,
          },
        ],
      };
    }
  }
  for (const [id, changes] of changesBySource) {
    const previous = files.find((file) => file.id === id)?.extractedData;
    const acceptedEvidence = result.extractedDocuments?.[id];
    const entry = acceptedEvidence ?? {
      ...(previous ?? { vin: null, fields: {}, rawFields: {} }),
      reextractionHistory: [
        ...(previous?.reextractionHistory ?? []),
        {
          analyzedAt: new Date().toISOString(),
          evidence: previous ? evidenceSnapshot(previous) : null,
        },
      ],
    };
    const history = entry.reextractionHistory!;
    entry.reextractionHistory = [
      ...history.slice(0, -1),
      { ...history.at(-1)!, changes },
    ];
    (result.extractedDocuments ??= {})[id] = entry;
  }
  return result;
}
