import { Inject, Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { z } from "zod";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import {
  extractionFieldsForType,
  scooterDocumentModelOutputSchema,
} from "./scooter-document-extraction.schema";
import { SCOOTER_DOCUMENT_EXTRACTION_PROVIDER } from "./scooter-document-extraction.types";
import type {
  AnalyzeScooterDocumentInput,
  ScooterDocumentExtractionProvider,
  ScooterDocumentExtractionResult,
} from "./scooter-document-extraction.types";

const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
const dateFields = new Set([
  "civIssuedAt",
  "registrationDate",
  "temporaryRegistrationExpiresAt",
  "validFrom",
  "validUntil",
  "foreignFirstRegistrationDate",
  "foreignRegistrationDate",
  "exportDate",
]);
const fieldSchemas: Record<string, z.ZodType> = {
  ...v1.scooters.createScooterInputSchema.shape,
  ...v1.scooters.insurancePolicyInputSchema.shape,
  brandName: z.string().trim().min(1).max(120),
  ...Object.fromEntries(
    [
      "registrationCounty",
      "registrationLocality",
      "registrationLocalityCode",
      "registrationHolder",
      "foreignRegistrationNumber",
      "foreignRegistrationCountry",
      "foreignRegistrationCertificateNumber",
      "foreignRegistrationHolder",
      "exportCertificateNumber",
      "exporterName",
      "exportRecipientName",
    ].map((key) => [key, z.string().trim().min(1).max(200)]),
  ),
  foreignFirstRegistrationDate: z.iso.date(),
  foreignRegistrationDate: z.iso.date(),
  exportDate: z.iso.date(),
};

@Injectable()
export class ScooterDocumentExtractionService {
  constructor(
    @Inject(SCOOTER_DOCUMENT_EXTRACTION_PROVIDER)
    private readonly provider: ScooterDocumentExtractionProvider,
  ) {}

  async analyze(
    input: AnalyzeScooterDocumentInput,
  ): Promise<ScooterDocumentExtractionResult> {
    validateSource(input);
    return this.normalize(
      input.documentType,
      await this.provider.analyze(input),
      input.contentType === "application/pdf" ? undefined : 1,
    );
  }

  detectType(output: unknown): v1.scooters.ScooterDocumentType {
    const parsed = parseModelOutput(output);
    if (!parsed.success)
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_FAILED",
        "Document extraction returned unusable data.",
        true,
      );
    // Supporting attachments remain storable even when no operational type is recognized.
    return predominantType(parsed.data) ?? "other";
  }

  /** Apply the same review rules to asynchronously retrieved provider output. */
  normalize(
    documentType: v1.scooters.ScooterDocumentType,
    output: unknown,
    originalPageCount?: number,
  ): ScooterDocumentExtractionResult {
    const parsed = parseModelOutput(output);
    if (!parsed.success) throw unusableOutput();
    if (
      originalPageCount !== undefined &&
      (!Number.isInteger(originalPageCount) ||
        originalPageCount < 1 ||
        originalPageCount > v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_MAX_PAGES)
    )
      throw unusableOutput();
    let result: ScooterDocumentExtractionResult;
    if (parsed.data.documents?.length) {
      if (
        originalPageCount !== undefined &&
        parsed.data.documents.some(
          (document) =>
            document.pages.some((page) => page > originalPageCount) ||
            document.regions.some((region) => region.page > originalPageCount),
        )
      )
        throw unusableOutput();
      result = this.normalizeDocuments(parsed.data);
    } else result = this.normalizeSingle(documentType, parsed.data);
    if (parsed.data.clientCopy) result.extractedData.clientCopy = true;
    return result;
  }

  private normalizeDocuments(
    model: ModelOutput,
  ): ScooterDocumentExtractionResult {
    const documents = model.documents!.map((document, index) => {
      const normalized = this.normalizeSingle(document.documentType, {
        ...document,
        detectedDocumentType: document.documentType,
        clientCopy: false,
        documents: null,
      });
      const inspections = normalizeInspections(document, normalized.issues);
      if (
        document.regions.some(
          (region) =>
            !document.pages.includes(region.page) ||
            region.x + region.width > 1.000001 ||
            region.y + region.height > 1.000001,
        )
      )
        normalized.issues.push({ field: "regions", code: "invalidValue" });
      return {
        id: `document-${index + 1}`,
        documentType: document.documentType,
        pages: [...new Set(document.pages)].sort((a, b) => a - b),
        regions: document.regions.filter(
          (region) =>
            document.pages.includes(region.page) &&
            region.x + region.width <= 1.000001 &&
            region.y + region.height <= 1.000001,
        ),
        ...normalized.extractedData,
        issues: normalized.issues,
        ...(inspections.length ? { inspections } : {}),
      };
    });
    const issues: ScooterDocumentExtractionResult["issues"] = [];
    const addIssue = (
      field: string,
      code: ScooterDocumentExtractionResult["issues"][number]["code"],
    ) => {
      if (!issues.some((item) => item.field === field && item.code === code))
        issues.push({ field, code });
    };
    for (const document of documents)
      for (const issue of document.issues) addIssue(issue.field, issue.code);
    const vins = new Set(
      documents.flatMap((document) => (document.vin ? [document.vin] : [])),
    );
    const vin = v1.scooters.preferredScooterDocumentVin(documents);
    if (vins.size > 1) addIssue("vin", "conflictingValues");
    const fields: v1.scooters.ScooterDocumentExtractedData["fields"] = {};
    const rawFields: v1.scooters.ScooterDocumentExtractedData["rawFields"] = {};
    const ranks = new Map<string, number>();
    const conflicts = new Set<string>();
    // Never merge records that may describe different vehicles. Full original
    // readings remain visible in documents for manual separation/correction.
    if (vins.size <= 1) {
      for (const document of documents) {
        if (
          !document.vin &&
          vins.size > 0 &&
          v1.scooters.scooterDocumentReadsVin(document.documentType)
        )
          continue;
        for (const [field, value] of Object.entries(document.fields)) {
          const rank = fieldAuthority(document.documentType, field);
          const previousRank = ranks.get(field) ?? -1;
          if (value === null || value === "-") {
            if (!Object.hasOwn(fields, field)) fields[field] = value;
            continue;
          }
          if (
            previousRank >= 0 &&
            fields[field] !== null &&
            fields[field] !== "-" &&
            fields[field] !== value
          )
            addIssue(field, "conflictingValues");
          if (rank > previousRank) {
            fields[field] = value;
            ranks.set(field, rank);
            conflicts.delete(field);
          } else if (rank === previousRank && fields[field] !== value) {
            fields[field] = null;
            conflicts.add(field);
            addIssue(field, "conflictingValues");
          }
          if (conflicts.has(field)) fields[field] = null;
        }
      }
    }
    fields.vin = vin;
    if (Object.hasOwn(fields, "documentVin") && !vin) fields.documentVin = null;
    // Parent raw fields are a bounded preview only. Logical records retain all
    // readings without collisions between identical rubric labels.
    for (const document of documents) {
      for (const [key, value] of Object.entries(document.rawFields)) {
        if (Object.keys(rawFields).length >= 100) break;
        rawFields[`${document.id}:${key}`.slice(0, 120)] = value;
      }
    }
    return {
      extractedData: v1.scooters.scooterDocumentExtractedDataSchema.parse({
        vin,
        fields,
        rawFields,
        documents,
      }),
      issues,
    };
  }

  private normalizeSingle(
    documentType: v1.scooters.ScooterDocumentType,
    model: ModelOutput,
  ): ScooterDocumentExtractionResult {
    // Defensive normalization also covers old provider responses and legacy jobs.
    if (!v1.scooters.scooterDocumentReadsVin(documentType)) {
      model = {
        ...model,
        vin: null,
        fields: model.fields.filter(
          (entry) => !["vin", "documentVin"].includes(entry.field),
        ),
        rawFields: model.rawFields.filter(
          (entry) =>
            !["vin", "documentVin"].includes(
              rawFieldTarget(entry.key, documentType, "unknown") ?? "",
            ) && !/vin|chassis|serie.*[șs]asiu/i.test(entry.key),
        ),
      };
    }
    const input = { documentType };
    const result: ScooterDocumentExtractionResult = {
      extractedData: { vin: null, fields: {}, rawFields: {} },
      issues: [],
    };
    const { fields, rawFields } = result.extractedData;
    const issue = (
      field: string,
      code: ScooterDocumentExtractionResult["issues"][number]["code"],
    ) => {
      if (
        !result.issues.some(
          (item) => item.field === field && item.code === code,
        )
      )
        result.issues.push({ field, code });
    };
    if (model.detectedDocumentType !== input.documentType) {
      issue(
        "vin",
        model.detectedDocumentType === null ? "noData" : "typeMismatch",
      );
      return result;
    }

    const allowed = new Set(extractionFieldsForType(input.documentType));
    const versions = new Set(
      model.fields
        .filter((entry) => entry.field === "civVersion")
        .map((entry) => entry.value),
    );
    const version = versions.size === 1 ? [...versions][0] : "unknown";
    const civVersion =
      typeof version === "string" &&
      (v1.vehicleCiv.CIV_VERSIONS as readonly string[]).includes(version)
        ? (version as v1.vehicleCiv.CivVersion)
        : "unknown";
    const rawTarget = (key: string) =>
      rawFieldTarget(key, input.documentType, civVersion);
    let uncertainVin = false;
    const conflictingRawFields = new Set<string>();
    for (const entry of model.rawFields) {
      if (unsafeKeys.has(entry.key)) continue;
      if (
        input.documentType === "insurance" &&
        !allowed.has(entry.key) &&
        !["paidAmount", "paymentDate", "paymentReference"].includes(entry.key)
      )
        continue;
      if (
        input.documentType === "insurance" &&
        (entry.value?.length ?? 0) > 500
      ) {
        issue(entry.key, "invalidValue");
        continue;
      }
      if (
        Object.hasOwn(rawFields, entry.key) &&
        rawFields[entry.key] !== entry.value
      ) {
        // Keep each original reading as separate evidence before marking the
        // ambiguous semantic rubric unresolved.
        const readings = [rawFields[entry.key], entry.value];
        for (const reading of readings) {
          if (reading === null || Object.keys(rawFields).length >= 100)
            continue;
          const prefix = entry.key.slice(0, 100);
          const alreadyPreserved = Object.entries(rawFields).some(
            ([key, value]) =>
              key.startsWith(`${prefix} [reading `) && value === reading,
          );
          if (!alreadyPreserved) {
            let index = 1;
            while (Object.hasOwn(rawFields, `${prefix} [reading ${index}]`))
              index++;
            rawFields[`${prefix} [reading ${index}]`] = reading;
          }
        }
        conflictingRawFields.add(entry.key);
        const target = allowed.has(entry.key)
          ? entry.key
          : rawTarget(entry.key);
        issue(target ?? "rawFields", "conflictingValues");
        if (target === "vin" || target === "documentVin") uncertainVin = true;
      }
      rawFields[entry.key] = conflictingRawFields.has(entry.key)
        ? null
        : entry.value;
    }
    const preserveRaw = (key: string, value: string | null) => {
      if (Object.hasOwn(rawFields, key)) return;
      // Only the matching confirmed rubric can stand in for a semantic key.
      // Equal zeroes/dashes in unrelated fields are distinct source evidence.
      if (
        input.documentType === "civ" &&
        typeof version === "string" &&
        (v1.vehicleCiv.CIV_VERSIONS as readonly string[]).includes(version)
      ) {
        if (
          value !== null &&
          Object.entries(rawFields).some(
            ([label, reading]) => rawTarget(label) === key && reading === value,
          )
        )
          return;
      }
      if (input.documentType === "insurance" && (value?.length ?? 0) > 500) {
        issue(key, "invalidValue");
        return;
      }
      if (Object.keys(rawFields).length < 100) rawFields[key] = value;
      else issue(key, "invalidValue");
    };
    const rootVin = normalizeVin(model.vin);
    result.extractedData.vin = uncertainVin ? null : rootVin;
    for (const entry of model.rawFields) {
      const target = rawTarget(entry.key);
      if (target !== "vin" && target !== "documentVin") continue;
      const rawVin = normalizeVin(entry.value);
      if (rawVin !== rootVin || !rawVin) {
        result.extractedData.vin = null;
        issue("vin", rawVin ? "conflictingValues" : "unreadable");
      }
    }
    if (!rootVin && v1.scooters.scooterDocumentReadsVin(documentType))
      issue(
        "vin",
        model.vin?.trim() && model.vin !== "-" ? "invalidValue" : "unreadable",
      );
    if (model.vin)
      preserveRaw(
        input.documentType === "insurance" ? "documentVin" : "vin",
        model.vin,
      );

    const conflictingFields = new Set<string>();
    for (const entry of model.fields) {
      if (!allowed.has(entry.field)) {
        issue(entry.field, "invalidValue");
        continue;
      }
      preserveRaw(entry.field, entry.rawValue);
      const rawDash = entry.rawValue?.trim() === "-";
      const emptyValue =
        entry.value === null ||
        (typeof entry.value === "string" &&
          ["", "-"].includes(entry.value.trim()));
      const dashConflict = rawDash && !emptyValue;
      const confirmedEmpty = rawDash && emptyValue;
      const value = normalizeValue(
        entry.field,
        confirmedEmpty ? "-" : entry.value,
      );
      if (dashConflict) {
        conflictingFields.add(entry.field);
        issue(entry.field, "conflictingValues");
      } else if (!value.valid) issue(entry.field, "invalidValue");
      else if (value.value === null || (entry.needsReview && !confirmedEmpty))
        issue(entry.field, "unreadable");
      if (
        Object.hasOwn(fields, entry.field) &&
        fields[entry.field] !== value.value
      ) {
        conflictingFields.add(entry.field);
        issue(entry.field, "conflictingValues");
      }
      fields[entry.field] = conflictingFields.has(entry.field)
        ? null
        : value.value;
      if (["vin", "documentVin"].includes(entry.field)) {
        const entryVin = normalizeVin(value.value);
        const rawVin = normalizeVin(entry.rawValue);
        if (entry.needsReview || !entryVin || !rawVin || dashConflict) {
          result.extractedData.vin = null;
          issue("vin", "unreadable");
        }
        if (
          entryVin &&
          (entryVin !== rootVin || (rawVin && rawVin !== entryVin))
        ) {
          result.extractedData.vin = null;
          conflictingFields.add(entry.field);
          fields[entry.field] = null;
          issue("vin", "conflictingValues");
        }
      }
    }
    if (!result.extractedData.vin) {
      for (const field of ["vin", "documentVin"])
        if (Object.hasOwn(fields, field)) fields[field] = null;
    } else if (input.documentType !== "insurance") {
      fields.vin = result.extractedData.vin;
    }

    // Do not silently treat omission of a required review field as a successful
    // reading. Optional layout-specific fields remain absent when inapplicable.
    const criticalFields =
      input.documentType === "insurance"
        ? [...v1.scooters.INSURANCE_FIELDS]
        : input.documentType === "registration_certificate"
          ? [
              "registrationType",
              "registrationNumber",
              "registrationDate",
              "registrationCertificateNumber",
            ]
          : input.documentType === "civ"
            ? ["vin", "brandName", "powertrainType", "civIssuedAt"]
            : input.documentType === "itp_card"
              ? []
              : input.documentType === "itp_certificate" ||
                  input.documentType === "export_certificate"
                ? ["vin"]
                : ["vin", "brandName", "powertrainType"];
    for (const field of criticalFields) {
      if (!Object.hasOwn(fields, field)) {
        fields[field] = null;
        issue(field, "unreadable");
      }
    }

    if (
      input.documentType === "civ" &&
      (fields.civIssuedAt === null || fields.civIssuedAt === "-")
    )
      issue("civIssuedAt", "unreadable");

    const invalidate = (field: string) => {
      fields[field] = null;
      issue(field, "invalidValue");
    };
    const known = (field: string): string | number | undefined => {
      const value = fields[field];
      return value !== null && value !== "-" ? value : undefined;
    };
    const powertrain = known("powertrainType");
    if (typeof powertrain === "string") {
      for (const field of v1.scooters.inactivePowertrainFields(powertrain)) {
        if (known(field) !== undefined) invalidate(field);
      }
      const fuel = known("fuelType");
      if (
        typeof fuel === "string" &&
        !v1.scooters.fuelMatchesPowertrain(powertrain, fuel)
      )
        invalidate("fuelType");
    }
    for (const field of v1.scooters.SCOOTER_CIV_FIELDS) {
      const other = `${field}Other`;
      if (known(field) === "other" && !known(other)) {
        invalidate(field);
        issue(other, "unreadable");
      } else if (known(other) !== undefined && known(field) !== "other") {
        invalidate(other);
      }
    }
    const registrationType = known("registrationType");
    const registrationNumber = known("registrationNumber");
    if (registrationType === "unregistered") {
      for (const field of [
        "registrationNumber",
        "registrationDate",
        "temporaryRegistrationExpiresAt",
      ])
        if (known(field) !== undefined) invalidate(field);
    } else if (
      registrationNumber !== undefined &&
      registrationType !== undefined
    ) {
      const plate = v1.scooters.validatePlateForRegistrationType(
        registrationType as v1.scooters.ScooterRegistrationType,
        String(registrationNumber),
      );
      if (plate) fields.registrationNumber = plate.displayValue;
      else invalidate("registrationNumber");
    }
    if (
      known("temporaryRegistrationExpiresAt") !== undefined &&
      registrationType !== "temporary"
    )
      invalidate("temporaryRegistrationExpiresAt");
    for (const [start, end] of [
      ["validFrom", "validUntil"],
      ["registrationDate", "temporaryRegistrationExpiresAt"],
    ]) {
      const from = known(start);
      const until = known(end);
      if (typeof from === "string" && typeof until === "string" && until < from)
        invalidate(end);
    }
    if (
      !result.extractedData.vin &&
      !Object.values(fields).some((value) => value !== null && value !== "-")
    )
      issue(
        v1.scooters.scooterDocumentReadsVin(documentType) ? "vin" : "document",
        "noData",
      );
    result.extractedData = v1.scooters.scooterDocumentExtractedDataSchema.parse(
      result.extractedData,
    );
    return result;
  }
}

function normalizeVin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const vin = value.trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

/** Resolve source labels conservatively; an unrelated rubric must not block VIN review. */
function rawFieldTarget(
  key: string,
  type: v1.scooters.ScooterDocumentType,
  version: v1.vehicleCiv.CivVersion,
): string | undefined {
  if (
    (
      v1.scooters.SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS as readonly string[]
    ).includes(key)
  )
    return key;
  const label = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (
    /\bvin\b|numar.*identificare|vehicle identification|chassis (?:number|no)/i.test(
      label,
    )
  )
    return "vin";
  const code = /^([A-Z](?:\.\d+)?|\d+(?:\.\d+)?)(?:\.?\s|\.?$)/.exec(
    label,
  )?.[1];
  if (code === "E" && type !== "insurance") return "vin";
  if (type !== "civ" || !code) return undefined;
  if (code === "D.2" && /variant/i.test(label)) return "variant";
  if (code === "D.2" && /versi/i.test(label)) return "version";
  const field = v1.vehicleCiv.resolveCivField(version, code);
  return field === "brandId"
    ? "brandName"
    : field === "propulsionSystem"
      ? "powertrainType"
      : field;
}

function normalizeValue(
  field: string,
  raw: string | number | null,
): { valid: boolean; value: string | number | null } {
  if (raw === null || (typeof raw === "string" && raw.trim() === ""))
    return { valid: true, value: null };
  if (typeof raw === "string" && raw.trim() === "-")
    return { valid: true, value: "-" };
  let candidate: string | number = typeof raw === "string" ? raw.trim() : raw;
  if (dateFields.has(field) && typeof candidate === "string") {
    const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(candidate);
    if (parts)
      candidate = `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  if (field === "currency" && typeof candidate === "string") {
    candidate = /^(lei|leu)$/i.test(candidate)
      ? "RON"
      : candidate.toUpperCase();
  }
  const schema = fieldSchemas[field];
  if (!schema) return { valid: false, value: null };
  let parsed = schema.safeParse(candidate);
  if (!parsed.success && typeof candidate === "string") {
    const number = v1.vehicleCiv.parseCivNumber(candidate);
    if (number !== null && Number.isFinite(number))
      parsed = schema.safeParse(number);
  }
  if (
    !parsed.success ||
    (typeof parsed.data !== "string" && typeof parsed.data !== "number")
  )
    return { valid: false, value: null };
  return { valid: true, value: parsed.data };
}

function validateSource(input: AnalyzeScooterDocumentInput): void {
  if (
    !input.bytes.byteLength ||
    !v1.scooters.SCOOTER_DOCUMENT_TYPES.includes(input.documentType)
  )
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      "A nonempty scooter document is required.",
      false,
    );
  if (input.bytes.byteLength > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "Document extraction accepts up to 10 MiB per source.",
      false,
    );
  if (
    !(v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(
      input.contentType,
    )
  )
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
      "Use a PDF, JPEG, PNG or WebP document.",
      false,
    );
}

type ModelOutput = z.infer<typeof scooterDocumentModelOutputSchema>;
function parseModelOutput(output: unknown) {
  // Jobs already submitted with the previous prompt may complete during rollout.
  const compatible =
    output && typeof output === "object" && !Array.isArray(output)
      ? {
          ...(!Object.hasOwn(output, "documents") ? { documents: null } : {}),
          ...(!Object.hasOwn(output, "clientCopy")
            ? { clientCopy: false }
            : {}),
          ...output,
        }
      : output;
  return scooterDocumentModelOutputSchema.safeParse(compatible);
}
function unusableOutput() {
  return new DocumentExtractionError(
    "DOCUMENT_EXTRACTION_FAILED",
    "Document extraction returned unusable data.",
    true,
  );
}
function predominantType(
  model: ModelOutput,
): v1.scooters.ScooterDocumentType | null {
  if (!model.documents?.length) return model.detectedDocumentType;
  for (const type of [
    "civ",
    "registration_certificate",
    "foreign_registration",
    "export_certificate",
    "import_document",
    "insurance",
    "itp_card",
    "itp_certificate",
  ] as const)
    if (model.documents.some((document) => document.documentType === type))
      return type;
  return null;
}
function fieldAuthority(
  type: v1.scooters.ScooterDocumentType,
  field: string,
): number {
  if (field.startsWith("registration"))
    return type === "registration_certificate" ? 100 : 0;
  if (field.startsWith("foreign"))
    return type === "foreign_registration" ? 100 : 50;
  if (field.startsWith("export"))
    return type === "export_certificate" ? 100 : 50;
  if ((v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(field))
    return type === "insurance" ? 100 : 0;
  return type === "civ" ? 100 : type === "foreign_registration" ? 80 : 50;
}
function normalizeInspections(
  document: NonNullable<ModelOutput["documents"]>[number],
  issues: ScooterDocumentExtractionResult["issues"],
): v1.scooters.ScooterDocumentInspection[] {
  if (
    document.documentType !== "itp_card" &&
    document.documentType !== "itp_certificate"
  )
    return [];
  const issue = (field: string) => {
    if (
      !issues.some(
        (item) => item.field === field && item.code === "invalidValue",
      )
    )
      issues.push({ field, code: "invalidValue" });
  };
  const date = (value: string | null, field: string) => {
    if (!value) return null;
    const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
    const normalized = parts
      ? `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`
      : value.trim();
    const parsed = z.iso.date().safeParse(normalized);
    if (!parsed.success) {
      issue(field);
      return null;
    }
    return parsed.data;
  };
  if (!document.inspections.length)
    issues.push({ field: "inspections", code: "unreadable" });
  return document.inspections.map((entry, index) => {
    const inspectionDate = date(
      entry.inspectionDate,
      `inspections.${index}.inspectionDate`,
    );
    let validUntil = date(entry.validUntil, `inspections.${index}.validUntil`);
    if (inspectionDate && validUntil && validUntil < inspectionDate) {
      issue(`inspections.${index}.validUntil`);
      validUntil = null;
    }
    if (!inspectionDate)
      issues.push({
        field: `inspections.${index}.inspectionDate`,
        code: "unreadable",
      });
    if (!validUntil)
      issues.push({
        field: `inspections.${index}.validUntil`,
        code: "unreadable",
      });
    if (entry.result === null || entry.result === "unknown")
      issues.push({ field: `inspections.${index}.result`, code: "unreadable" });
    const rawFields: Record<string, string | null> = {};
    for (const reading of entry.rawFields)
      if (!unsafeKeys.has(reading.key)) rawFields[reading.key] = reading.value;
    for (const key of [
      "inspectionDate",
      "validUntil",
      "result",
      "certificateNumber",
      "odometerKm",
    ] as const) {
      const value = entry[key];
      if (Object.hasOwn(rawFields, key)) continue;
      if (Object.keys(rawFields).length < 100)
        rawFields[key] = value === null ? null : String(value);
    }
    const odometerKm =
      entry.odometerKm !== null &&
      Number.isInteger(entry.odometerKm) &&
      entry.odometerKm >= 0 &&
      entry.odometerKm <= 2_147_483_647
        ? entry.odometerKm
        : null;
    if (entry.odometerKm !== null && odometerKm === null)
      issue(`inspections.${index}.odometerKm`);
    return {
      inspectionDate,
      validUntil,
      result: entry.result,
      certificateNumber: entry.certificateNumber?.trim() || null,
      odometerKm,
      rawFields,
    };
  });
}
