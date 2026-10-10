import { v1 } from "@repo/api-shared";

export interface DocumentSource {
  sourceId: string;
  type: v1.scooters.ScooterDocumentType;
  fileName: string;
  insurancePolicyId?: string | null;
}
export type ExtractedDocumentData = v1.scooters.ScooterDocumentExtractedData;
export interface SourceImportData {
  source: Record<string, unknown>;
  extractedDocuments: Record<string, ExtractedDocumentData>;
  fieldSources: Record<string, string[]>;
  unresolvedDocumentFields: Record<string, string[]>;
}
export interface SourceImportIssue {
  kind: "fileNames" | "coverage" | "ambiguous";
  provided: string[];
  uploaded: string[];
}
export type SourceImportResult =
  | ({ ok: true } & SourceImportData)
  | {
      ok: false;
      reason: "invalidSources" | "invalidFields";
      fields: string[];
      sourceIssue?: SourceImportIssue;
    };

const registrationFields = new Set([
  "registrationType",
  "registrationNumber",
  "registrationDate",
  "registrationCertificateNumber",
  "temporaryRegistrationExpiresAt",
]);
const civMetadata = new Set([
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
]);
const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
export function isRetiredCivRawLabel(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase() === "mentiuni"
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validKey(key: string, max: number) {
  return key.length > 0 && key.length <= max && !unsafeKeys.has(key);
}
function normalizeVin(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === "-") return null;
  if (typeof value !== "string") return undefined;
  const vin = value.trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : undefined;
}
function unknown(value: unknown) {
  return value === null || (typeof value === "string" && !value.trim());
}

function legacyFileName(value: string) {
  // Browsers append a counter when the same document is downloaded again.
  // Keep the rest of the basename and extension intact; do not guess other renames.
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/u, "");
}
function matchesLegacyFileName(value: unknown, attached: string) {
  return (
    typeof value === "string" &&
    legacyFileName(value) === legacyFileName(attached)
  );
}
function findLegacySource(value: unknown, sources: DocumentSource[]) {
  if (typeof value !== "string") return undefined;
  const exact = sources.filter(
    (source) =>
      source.fileName.normalize("NFC").trim() === value.normalize("NFC").trim(),
  );
  const candidates = exact.length
    ? exact
    : sources.filter((source) => matchesLegacyFileName(value, source.fileName));
  return candidates.length === 1 ? candidates[0] : undefined;
}
function evidenceFileNames(evidence: unknown): string[] {
  return Array.isArray(evidence)
    ? evidence.flatMap((entry) =>
        record(entry) && typeof entry.fileName === "string"
          ? [entry.fileName]
          : [],
      )
    : [];
}
function sourceAssociationFailure(
  kind: SourceImportIssue["kind"],
  sources: DocumentSource[],
  provided: string[],
  ...fields: string[]
): Extract<SourceImportResult, { ok: false }> {
  return {
    ok: false,
    reason: "invalidSources",
    fields,
    sourceIssue: {
      kind,
      provided,
      uploaded: sources.map((source) => source.fileName),
    },
  };
}

/** Recover legacy provenance only when each category has a single possible source. */
function prepareLegacyDocuments(
  input: Record<string, unknown>,
  sources: DocumentSource[],
):
  | { ok: true; envelope: Record<string, unknown> }
  | Extract<SourceImportResult, { ok: false }> {
  const fail = (
    ...fields: string[]
  ): Extract<SourceImportResult, { ok: false }> => ({
    ok: false,
    reason: "invalidSources",
    fields,
  });
  const technical = sources.filter(
    (source) => source.type === "civ" || source.type === "import_document",
  );
  const registration = sources.filter(
    (source) => source.type === "registration_certificate",
  );
  const insurance = sources.filter((source) => source.type === "insurance");
  const evidence = input.documentVins;
  // A flat object cannot attribute values to different technical documents or
  // distinguish files sharing a filename. Require v2 for those cases.
  if (
    technical.length > 1 ||
    registration.length > 1 ||
    insurance.length > 1 ||
    new Set(sources.map((source) => source.fileName)).size !== sources.length
  )
    return sourceAssociationFailure(
      "ambiguous",
      sources,
      evidenceFileNames(evidence),
      "documentVins",
    );
  if (!Array.isArray(evidence) || evidence.length !== sources.length)
    return sourceAssociationFailure(
      "coverage",
      sources,
      evidenceFileNames(evidence),
      "documentVins",
    );
  const documents = sources.map((source) => ({
    sourceId: source.sourceId,
    documentType: source.type,
    vin: null as unknown,
    fields: {} as Record<string, unknown>,
    rawFields: {} as unknown,
  }));
  const matched = new Set<string>();
  for (const entry of evidence) {
    if (
      !record(entry) ||
      Object.keys(entry).some(
        (key) => !["fileName", "documentType", "vin"].includes(key),
      )
    )
      return fail("documentVins");
    const attached = findLegacySource(entry.fileName, sources);
    if (!attached || attached.type !== entry.documentType)
      return sourceAssociationFailure(
        "fileNames",
        sources,
        evidenceFileNames(evidence),
        "documentVins",
      );
    if (matched.has(attached.sourceId))
      return sourceAssociationFailure(
        "ambiguous",
        sources,
        evidenceFileNames(evidence),
        "documentVins",
      );
    matched.add(attached.sourceId);
    documents.find((document) => document.sourceId === attached.sourceId)!.vin =
      entry.vin;
  }
  const documentFor = (source: DocumentSource | undefined) =>
    documents.find((document) => document.sourceId === source?.sourceId);
  const technicalDocument = documentFor(technical[0]);
  const registrationDocument = documentFor(registration[0]);
  const insuranceDocument = documentFor(insurance[0]);
  for (const [field, value] of Object.entries(input)) {
    if (!validKey(field, 120)) return fail(field);
    if (["documentVins", "insurancePolicies", "civMentions"].includes(field))
      continue;
    if (field === "civRawFields") {
      if (!technicalDocument || technicalDocument.documentType !== "civ")
        return fail(field);
      technicalDocument.rawFields = value ?? {};
      continue;
    }
    const target =
      registrationFields.has(field) || field === "requiredLicenseCategory"
        ? (registrationDocument ??
          (field === "requiredLicenseCategory" ? technicalDocument : undefined))
        : (technicalDocument ??
          (["vin", "brandName"].includes(field)
            ? registrationDocument
            : undefined));
    if (!target) return fail(field);
    // Keep the global VIN assertion as well as each file's own evidence, so the
    // normal validator catches disagreements instead of replacing a missing VIN.
    target.fields[field] = value;
  }
  if (input.insurancePolicies !== undefined) {
    const policies = input.insurancePolicies;
    if (!Array.isArray(policies) || policies.length > 1)
      return fail("insurancePolicies");
    if (policies.length) {
      const policy = policies[0];
      if (!insuranceDocument || !record(policy))
        return fail("insurancePolicies");
      if (
        !Array.isArray(policy.sourceFileNames) ||
        policy.sourceFileNames.length !== 1 ||
        findLegacySource(policy.sourceFileNames[0], sources)?.sourceId !==
          insurance[0]!.sourceId
      )
        return sourceAssociationFailure(
          "fileNames",
          insurance,
          Array.isArray(policy.sourceFileNames)
            ? policy.sourceFileNames.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          "insurancePolicies.sourceFileNames",
        );
      insuranceDocument.fields = Object.fromEntries(
        Object.entries(policy).filter(
          ([key]) => !["sourceFileNames", "rawFields"].includes(key),
        ),
      );
      insuranceDocument.rawFields = policy.rawFields ?? {};
    }
  }
  return { ok: true, envelope: { schemaVersion: 2, documents } };
}

/** Enforce source authority before any normalized field can reach the form. */
export function prepareDocumentSources(
  input: Record<string, unknown>,
  sources: DocumentSource[],
  allowedFields: readonly string[],
): SourceImportResult {
  const fail = (
    reason: "invalidSources" | "invalidFields",
    ...fields: string[]
  ): SourceImportResult => ({ ok: false, reason, fields });
  if (
    !sources.length ||
    sources.length > v1.scooters.SCOOTER_DOCUMENT_MAX_FILES ||
    new Set(sources.map((source) => source.sourceId)).size !== sources.length ||
    sources.some((source) => !validKey(source.sourceId, 255))
  )
    return fail("invalidSources", "documents");
  let envelope = input;
  if (
    input.schemaVersion === undefined &&
    input.documents === undefined &&
    sources.length > 1
  ) {
    const legacy = prepareLegacyDocuments(input, sources);
    if (!legacy.ok) return legacy;
    envelope = legacy.envelope;
  }
  if (envelope.schemaVersion !== 2) {
    // Single-file legacy responses may omit the filename manifest entirely.
    if (
      sources.length !== 1 ||
      input.schemaVersion !== undefined ||
      input.documents !== undefined
    )
      return fail("invalidSources", "documents");
    const source = sources[0]!;
    const fields = { ...input };
    const rawFields = fields.civRawFields ?? {};
    const evidence = fields.documentVins;
    if (
      evidence !== undefined &&
      (!Array.isArray(evidence) ||
        evidence.length !== 1 ||
        !record(evidence[0]) ||
        !matchesLegacyFileName(evidence[0].fileName, source.fileName) ||
        evidence[0].documentType !== source.type)
    )
      return sourceAssociationFailure(
        "fileNames",
        sources,
        evidenceFileNames(evidence),
        "documentVins",
      );
    let vin: unknown = Array.isArray(evidence)
      ? evidence[0]?.vin
      : (fields.vin ?? null);
    delete fields.documentVins;
    delete fields.civRawFields;
    if (source.type === "insurance") {
      if (
        Object.keys(fields).some(
          (key) => key !== "insurancePolicies" && key !== "vin",
        )
      )
        return fail("invalidSources", "insurancePolicies");
      const policies = fields.insurancePolicies;
      if (
        !Array.isArray(policies) ||
        policies.length !== 1 ||
        !record(policies[0])
      )
        return fail("invalidSources", "insurancePolicies");
      const policy = policies[0];
      if (
        !Array.isArray(policy.sourceFileNames) ||
        policy.sourceFileNames.length !== 1 ||
        !matchesLegacyFileName(policy.sourceFileNames[0], source.fileName)
      )
        return sourceAssociationFailure(
          "fileNames",
          sources,
          Array.isArray(policy.sourceFileNames)
            ? policy.sourceFileNames.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          "insurancePolicies.sourceFileNames",
        );
      vin = vin ?? policy.documentVin ?? null;
      const policyFields = { ...policy };
      delete policyFields.sourceFileNames;
      delete policyFields.rawFields;
      envelope = {
        schemaVersion: 2,
        documents: [
          {
            sourceId: source.sourceId,
            documentType: source.type,
            vin,
            fields: policyFields,
            rawFields: policy.rawFields ?? {},
          },
        ],
      };
    } else {
      envelope = {
        schemaVersion: 2,
        documents: [
          {
            sourceId: source.sourceId,
            documentType: source.type,
            vin,
            fields,
            rawFields,
          },
        ],
      };
    }
  }
  if (
    Object.keys(envelope).some(
      (key) => !["schemaVersion", "documents"].includes(key),
    ) ||
    !Array.isArray(envelope.documents) ||
    envelope.documents.length !== sources.length
  )
    return fail("invalidSources", "documents");
  const extractedDocuments: Record<string, ExtractedDocumentData> = {};
  const fieldSources: Record<string, string[]> = {};
  const unresolvedDocumentFields: Record<string, string[]> = {};
  const source: Record<string, unknown> = {};
  const selectedValues = new Map<
    string,
    Array<{ id: string; value: string | number | null }>
  >();
  const rawValues = new Map<string, Array<string | null>>();
  const evidence: {
    fileName: string;
    documentType: string;
    vin: string | null;
  }[] = [];
  const policies: Record<string, unknown>[] = [];
  const hasCiv = sources.some((entry) => entry.type === "civ");
  const hasTechnical = sources.some(
    (entry) => entry.type === "civ" || entry.type === "import_document",
  );
  const allowed = new Set(allowedFields);
  allowed.add("brandName");
  for (const entry of envelope.documents) {
    if (
      !record(entry) ||
      Object.keys(entry).some(
        (key) =>
          ![
            "sourceId",
            "documentType",
            "vin",
            "fields",
            "rawFields",
            "vinReview",
          ].includes(key),
      ) ||
      typeof entry.sourceId !== "string"
    )
      return fail("invalidSources", "documents");
    const attached = sources.find((item) => item.sourceId === entry.sourceId);
    if (
      !attached ||
      attached.type !== entry.documentType ||
      Object.hasOwn(extractedDocuments, attached.sourceId)
    )
      return fail("invalidSources", entry.sourceId);
    const vin = normalizeVin(entry.vin);
    if (vin === undefined)
      return fail("invalidFields", `${attached.fileName}.vin`);
    if (
      !record(entry.fields) ||
      !record(entry.rawFields) ||
      Object.keys(entry.fields).length > 100 ||
      Object.keys(entry.rawFields).length > 100
    )
      return fail("invalidFields", attached.fileName);
    const fields: ExtractedDocumentData["fields"] = {};
    const rawFields: ExtractedDocumentData["rawFields"] = {};
    for (const [field, value] of Object.entries(entry.fields)) {
      if (field === "civMentions") continue;
      if (
        !validKey(field, 120) ||
        (value !== null &&
          typeof value !== "string" &&
          typeof value !== "number") ||
        (typeof value === "string" && value.length > 2000) ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        return fail("invalidFields", `${attached.fileName}.${field}`);
      const valid =
        attached.type === "insurance"
          ? (v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(field)
          : (allowed.has(field) ||
              registrationFields.has(field) ||
              field === "requiredLicenseCategory") &&
            (attached.type === "registration_certificate"
              ? registrationFields.has(field) ||
                ["vin", "brandName", "requiredLicenseCategory"].includes(field)
              : !registrationFields.has(field) &&
                (attached.type === "civ" || !civMetadata.has(field)));
      if (!valid) return fail("invalidFields", `${attached.fileName}.${field}`);
      // A second VIN assertion inside fields must agree with the per-document evidence.
      if (
        ["vin", "documentVin"].includes(field) &&
        !unknown(value) &&
        value !== "-" &&
        normalizeVin(value) !== vin
      )
        return fail("invalidSources", `${attached.fileName}.${field}`);
      fields[field] = value;
    }
    for (const [key, value] of Object.entries(entry.rawFields)) {
      if (isRetiredCivRawLabel(key)) continue;
      if (
        !validKey(key, 120) ||
        (value !== null && (typeof value !== "string" || value.length > 2000))
      )
        return fail("invalidFields", `${attached.fileName}.rawFields.${key}`);
      rawFields[key] = value;
    }
    const review =
      v1.scooters.scooterDocumentExtractedDataSchema.shape.vinReview.safeParse(
        entry.vinReview,
      );
    if (!review.success)
      return fail("invalidFields", `${attached.fileName}.vinReview`);
    extractedDocuments[attached.sourceId] = {
      vin,
      fields,
      rawFields,
      ...(review.data ? { vinReview: review.data } : {}),
    };
    const skipped = attached.type === "import_document" && hasCiv;
    if (!skipped) {
      evidence.push({
        fileName: attached.fileName,
        documentType: attached.type,
        vin,
      });
      const unknownRaw = Object.entries(rawFields)
        .filter(([, value]) => unknown(value))
        .map(([key]) => key);
      if (unknownRaw.length)
        unresolvedDocumentFields[attached.sourceId] = unknownRaw;
    }
    if (attached.type === "insurance") {
      const insuranceRaw = Object.fromEntries(
        Object.entries(rawFields).filter(([key]) =>
          (v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(key),
        ),
      );
      policies.push({
        ...fields,
        documentVin: vin,
        sourceFileNames: [attached.fileName],
        rawFields: insuranceRaw,
      });
      fieldSources[
        `insurancePolicies:${attached.insurancePolicyId ?? attached.sourceId}`
      ] = [attached.sourceId];
      continue;
    }
    if (skipped) continue;
    const selected = { ...fields };
    // VIN is both source evidence and the vehicle identifier, even without a technical document.
    if (!("vin" in selected) && vin) selected.vin = vin;
    for (const [field, value] of Object.entries(selected)) {
      if (!allowed.has(field)) continue;
      if (
        attached.type === "registration_certificate" &&
        hasTechnical &&
        !registrationFields.has(field) &&
        field !== "requiredLicenseCategory"
      )
        continue;
      const values = selectedValues.get(field) ?? [];
      values.push({ id: attached.sourceId, value });
      selectedValues.set(field, values);
    }
    if (attached.type === "civ") {
      for (const [key, value] of Object.entries(rawFields)) {
        const values = rawValues.get(key) ?? [];
        values.push(value);
        rawValues.set(key, values);
      }
    }
  }
  for (const [field, values] of selectedValues) {
    const known = values.filter(({ value }) => !unknown(value));
    const distinct = new Set(known.map(({ value }) => String(value).trim()));
    source[field] = distinct.size === 1 ? known[0]!.value : null;
    fieldSources[field === "brandName" ? "brandId" : field] = values.map(
      ({ id }) => id,
    );
  }
  if (rawValues.size) {
    source.civRawFields = Object.fromEntries(
      [...rawValues].map(([key, values]) => {
        const known = values.filter((value) => !unknown(value));
        return [key, new Set(known).size === 1 ? known[0] : null];
      }),
    );
  }
  if (!("vin" in source)) {
    const withVin = sources.filter(
      (entry) =>
        !(hasCiv && entry.type === "import_document") &&
        extractedDocuments[entry.sourceId]?.vin,
    );
    const vins = new Set(
      withVin.map((entry) => extractedDocuments[entry.sourceId]!.vin),
    );
    if (vins.size === 1) {
      source.vin = extractedDocuments[withVin[0]!.sourceId]!.vin;
      fieldSources.vin = withVin.map((entry) => entry.sourceId);
    }
  }
  source.documentVins = evidence;
  if (policies.length) source.insurancePolicies = policies;
  return {
    ok: true,
    source,
    extractedDocuments,
    fieldSources,
    unresolvedDocumentFields,
  };
}
