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
  options?: {
    currentInsuranceSourceId: string | null;
    currentInsuranceSourceIds?: string[];
  },
): DocumentImportResult {
  const selectedInsuranceIds =
    options?.currentInsuranceSourceIds ??
    (options?.currentInsuranceSourceId
      ? [options.currentInsuranceSourceId]
      : []);
  const physicalSources = sources;
  const physicalById = new Map<string, string>();
  const expandedAnalyses: v1.scooters.ScooterDocumentAnalysis[] = [];
  sources = physicalSources.flatMap((source) => {
    const analysis = analyses.find((item) => item.sourceId === source.sourceId);
    if (!analysis?.extractedData.documents?.length) {
      physicalById.set(source.sourceId, source.sourceId);
      if (
        analysis &&
        !(
          source.type === "insurance" &&
          options &&
          !selectedInsuranceIds.includes(source.sourceId)
        )
      )
        expandedAnalyses.push(analysis);
      return source.type === "insurance" &&
        options &&
        !selectedInsuranceIds.includes(source.sourceId)
        ? []
        : [source];
    }
    return analysis.extractedData.documents.flatMap((document) => {
      const sourceId = `${source.sourceId}:${document.id}`;
      physicalById.set(sourceId, source.sourceId);
      if (
        document.documentType === "insurance" &&
        options &&
        !selectedInsuranceIds.includes(sourceId)
      )
        return [];
      // Metadata stays in the saved extraction; only form fields enter the form importer.
      const registration = new Set([
        "registrationType",
        "registrationNumber",
        "registrationDate",
        "registrationCertificateNumber",
        "temporaryRegistrationExpiresAt",
        "vin",
        "brandName",
        "requiredLicenseCategory",
      ]);
      const insurance = new Set<string>(v1.scooters.INSURANCE_FIELDS);
      const fields = Object.fromEntries(
        Object.entries(document.fields).filter(([field]) => {
          if (document.documentType === "insurance")
            return insurance.has(field);
          if (
            document.documentType !== "civ" &&
            [
              "civNumber",
              "civVersion",
              "civIssuedAt",
              "civIssuingAuthority",
            ].includes(field)
          )
            return false;
          if (["itp_card", "itp_certificate"].includes(document.documentType))
            return field === "vin";
          if (document.documentType === "registration_certificate")
            return registration.has(field);
          if (
            insurance.has(field) ||
            (registration.has(field) &&
              !["vin", "brandName", "requiredLicenseCategory"].includes(field))
          )
            return false;
          return (
            field in v1.scooters.createScooterInputSchema.shape ||
            field === "brandName"
          );
        }),
      );
      expandedAnalyses.push({
        ...analysis,
        sourceId,
        documentType: document.documentType,
        extractedData: {
          vin: document.vin,
          fields,
          rawFields: document.rawFields,
          ...(document.vinReview ? { vinReview: document.vinReview } : {}),
        },
        issues: (document.issues ?? []).filter(
          (issue) =>
            document.documentType === "civ" ||
            ![
              "civNumber",
              "civVersion",
              "civIssuedAt",
              "civIssuingAuthority",
            ].includes(issue.field),
        ),
      });
      return [{ ...source, sourceId, type: document.documentType }];
    });
  });
  const originalAnalyses = analyses;
  analyses = expandedAnalyses;
  const documents = sources.map((source) => {
    const analysis = analyses.find((item) => item.sourceId === source.sourceId);
    const data = analysis?.extractedData;
    return {
      sourceId: source.sourceId,
      documentType: source.type,
      vin: data?.vin ?? null,
      fields: { ...data?.fields },
      rawFields: { ...data?.rawFields },
      ...(data?.documents ? { documents: data.documents } : {}),
      ...(data?.vinReview ? { vinReview: data.vinReview } : {}),
    };
  });
  const identityReadings = originalAnalyses.flatMap((analysis) =>
    analysis.extractedData.documents?.length
      ? analysis.extractedData.documents
      : [
          {
            documentType: analysis.documentType,
            vin: analysis.extractedData.vin,
          },
        ],
  );
  if (
    editing &&
    values.vin &&
    identityReadings.some(
      (document) =>
        v1.scooters.scooterDocumentReadsVin(document.documentType) &&
        document.vin &&
        document.vin !== values.vin,
    )
  )
    return { ok: false, reason: "vinMismatch", fields: ["vin"] };
  const preferredVin =
    v1.scooters.preferredScooterDocumentVin(identityReadings);
  // Select one vehicle identity for form filling. Persist untouched readings below;
  // conflicting evidence still blocks final creation until reviewed.
  for (const document of documents) {
    const eligible = v1.scooters.scooterDocumentReadsVin(document.documentType);
    document.vin = eligible ? preferredVin : null;
    for (const field of ["vin", "documentVin"])
      if (Object.hasOwn(document.fields, field)) {
        if (eligible) document.fields[field] = preferredVin;
        else delete document.fields[field];
      }
  }
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
  function parse(): DocumentImportResult {
    if (!sources.length)
      return {
        ok: true,
        values: {},
        confirmedEmpty: [],
        unresolved: [],
        unresolvedRawFields: [],
        emptyConflicts: [],
      };
    return parseDocumentImport(
      JSON.stringify({ schemaVersion: 2, documents }),
      brands,
      preferredVin ? { ...values, vin: preferredVin } : values,
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
  if (preferredVin) {
    result.values.vin = preferredVin;
    (result.fieldSources ??= {}).vin = originalAnalyses
      .filter(
        (analysis) =>
          analysis.extractedData.documents?.some(
            (document) =>
              v1.scooters.scooterDocumentReadsVin(document.documentType) &&
              document.vin === preferredVin,
          ) ||
          (v1.scooters.scooterDocumentReadsVin(analysis.documentType) &&
            analysis.extractedData.vin === preferredVin),
      )
      .map((analysis) => analysis.sourceId);
  }
  // Placeholders above establish document authority/coverage only. Failed or skipped
  // requests must never become persisted "successful" extraction evidence.
  result.extractedDocuments = Object.fromEntries(
    originalAnalyses.map((analysis) => {
      const children = analysis.extractedData.documents;
      const containsInsurance =
        analysis.documentType === "insurance" ||
        children?.some((document) => document.documentType === "insurance");
      const selected = children?.find(
        (document) =>
          document.documentType === "insurance" &&
          selectedInsuranceIds.includes(`${analysis.sourceId}:${document.id}`),
      );
      const legacySelected =
        !children?.length && selectedInsuranceIds.includes(analysis.sourceId);
      return [
        analysis.sourceId,
        {
          ...analysis.extractedData,
          ...(!analysis.extractedData.documents?.length &&
          !v1.scooters.scooterDocumentReadsVin(analysis.documentType)
            ? {
                vin: null,
                fields: Object.fromEntries(
                  Object.entries(analysis.extractedData.fields).filter(
                    ([field]) => !["vin", "documentVin"].includes(field),
                  ),
                ),
              }
            : {}),
          ...(options && containsInsurance && !legacySelected
            ? { currentInsuranceDocumentId: selected?.id ?? null }
            : {}),
        },
      ];
    }),
  );
  for (const [sourceId, issues] of softIssues) {
    const source = sources.find((item) => item.sourceId === sourceId)!;
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
  if (result.fieldSources)
    result.fieldSources = Object.fromEntries(
      Object.entries(result.fieldSources).map(([field, ids]) => [
        field,
        [...new Set(ids.map((id) => physicalById.get(id) ?? id))],
      ]),
    );
  if (result.unresolvedDocumentFields) {
    const merged: Record<string, string[]> = {};
    for (const [id, fields] of Object.entries(
      result.unresolvedDocumentFields,
    )) {
      const physicalId = physicalById.get(id) ?? id;
      merged[physicalId] = [
        ...new Set([...(merged[physicalId] ?? []), ...fields]),
      ];
    }
    result.unresolvedDocumentFields = merged;
  }
  return result;
}
