import { v1 } from "@repo/api-shared";
import {
  parseDocumentImport,
  type DocumentImportResult,
} from "./scooter-document-import";
import type { DocumentSource } from "./scooter-document-sources";
import type { ScooterEditorValues } from "./scooter-editor-schema";

/** Both import paths use the same authority, VIN and form validation rules. */
export function prepareScooterAnalysisImport(
  analyses: v1.scooters.ScooterDocumentAnalysis[],
  sources: DocumentSource[],
  brands: Pick<v1.scooterBrands.ScooterBrand, "id" | "name">[],
  values: ScooterEditorValues,
  editing: boolean,
): DocumentImportResult {
  const documents = sources.map((source) => {
    const analysis = analyses.find((item) => item.sourceId === source.sourceId);
    const data = analysis?.extractedData;
    return {
      sourceId: source.sourceId,
      documentType: source.type,
      vin: data?.vin ?? null,
      fields: { ...data?.fields },
      rawFields: { ...data?.rawFields },
      ...(data?.vinReview ? { vinReview: data.vinReview } : {}),
    };
  });
  const softIssues = new Map<string, Set<string>>();
  for (const analysis of analyses) {
    const source = sources.find((item) => item.sourceId === analysis.sourceId);
    if (!source || source.type !== analysis.documentType)
      return {
        ok: false,
        reason: "invalidSources",
        fields: [analysis.sourceId],
      };
    softIssues.set(
      analysis.sourceId,
      new Set(analysis.issues.map((issue) => issue.field)),
    );
  }
  function parse() {
    return parseDocumentImport(
      JSON.stringify({ schemaVersion: 2, documents }),
      brands,
      values,
      editing,
      {},
      [],
      sources,
    );
  }
  let result = parse();
  // Client rules can depend on retained manual values (for example propulsion or
  // registration type). Keep usable suggestions and flag just the incompatible values.
  for (
    let attempt = 0;
    !result.ok && result.reason === "invalidFields" && attempt < 3;
    attempt += 1
  ) {
    let changed = false;
    for (const path of result.fields) {
      const field = path.startsWith("insurancePolicies.")
        ? path.slice("insurancePolicies.".length)
        : path;
      for (const document of documents) {
        if (
          path.startsWith("insurancePolicies.") !==
          (document.documentType === "insurance")
        )
          continue;
        if (!(field in document.fields) || document.fields[field] == null)
          continue;
        document.fields[field] = null;
        const issues = softIssues.get(document.sourceId) ?? new Set<string>();
        issues.add(field);
        softIssues.set(document.sourceId, issues);
        changed = true;
      }
    }
    if (!changed) break;
    result = parse();
  }
  if (!result.ok) return result;
  // Placeholders above establish document authority/coverage only. Failed or skipped
  // requests must never become persisted "successful" extraction evidence.
  const successful = new Set(analyses.map((analysis) => analysis.sourceId));
  result.extractedDocuments = Object.fromEntries(
    Object.entries(result.extractedDocuments ?? {}).filter(([id]) =>
      successful.has(id),
    ),
  );
  const hasCiv = sources.some((source) => source.type === "civ");
  for (const [sourceId, issues] of softIssues) {
    const source = sources.find((item) => item.sourceId === sourceId)!;
    if (source.type === "import_document" && hasCiv) continue;
    for (const field of issues) {
      if (field === "vin" || field === "documentVin") continue;
      if (source.type === "insurance") {
        const policy = result.insurancePolicies?.find(
          (item) => item.id === source.insurancePolicyId,
        );
        if (
          policy &&
          (v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(field)
        ) {
          const warnings = (result.unresolvedInsuranceFields ??= {});
          warnings[policy.id] = [
            ...new Set([...(warnings[policy.id] ?? []), field]),
          ];
        }
      } else if (
        field in v1.scooters.createScooterInputSchema.shape ||
        field === "brandName"
      ) {
        if (!result.unresolved.includes(field)) result.unresolved.push(field);
      } else {
        const warnings = (result.unresolvedDocumentFields ??= {});
        warnings[sourceId] = [
          ...new Set([...(warnings[sourceId] ?? []), field]),
        ];
      }
    }
  }
  return result;
}
