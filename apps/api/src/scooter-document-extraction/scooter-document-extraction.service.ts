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
]);
const fieldSchemas: Record<string, z.ZodType> = {
  ...v1.scooters.createScooterInputSchema.shape,
  ...v1.scooters.insurancePolicyInputSchema.shape,
  brandName: z.string().trim().min(1).max(120),
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
    const parsed = scooterDocumentModelOutputSchema.safeParse(
      await this.provider.analyze(input),
    );
    if (!parsed.success) {
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_FAILED",
        "Document extraction returned unusable data.",
        true,
      );
    }
    const model = parsed.data;
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
      const retired =
        entry.key
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase() === "mentiuni";
      if (unsafeKeys.has(entry.key) || retired) continue;
      if (input.documentType === "insurance" && !allowed.has(entry.key))
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
        const rubric = v1.vehicleCiv.civFieldHint(
          version as v1.vehicleCiv.CivVersion,
          key === "brandName"
            ? "brandId"
            : key === "powertrainType"
              ? "propulsionSystem"
              : key,
        );
        if (rubric && value !== null && rawFields[rubric] === value) return;
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
    if (!rootVin)
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
              "vin",
              "registrationType",
              "registrationNumber",
              "registrationDate",
              "registrationCertificateNumber",
            ]
          : ["vin", "brandName", "powertrainType"];
    for (const field of criticalFields) {
      if (!Object.hasOwn(fields, field)) {
        fields[field] = null;
        issue(field, "unreadable");
      }
    }

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
      issue("vin", "noData");
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
  const code = /^([A-Z](?:\.\d+)?|\d+(?:\.\d+)?)(?:\s|$)/.exec(label)?.[1];
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
