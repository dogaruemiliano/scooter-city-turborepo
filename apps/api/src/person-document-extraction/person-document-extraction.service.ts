import { Inject, Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { personDocumentModelOutputSchema } from "./person-document-extraction.schema";
import { normalizePersonAddressSuggestions } from "./person-address";
import { capitalizeExtractedName } from "./person-name";
import {
  PERSON_DOCUMENT_EXTRACTION_MAX_SOURCE_BYTES,
  PERSON_DOCUMENT_EXTRACTION_PROVIDER,
} from "./person-document-extraction.types";
import type {
  AnalyzePersonDocumentInput,
  PersonDocumentExtractionProvider,
} from "./person-document-extraction.types";

@Injectable()
export class PersonDocumentExtractionService {
  constructor(
    @Inject(PERSON_DOCUMENT_EXTRACTION_PROVIDER)
    private readonly provider: PersonDocumentExtractionProvider,
  ) {}

  async analyze(
    input: AnalyzePersonDocumentInput,
  ): Promise<v1.persons.PersonDocumentExtractionContent> {
    validateSources(input);
    const parsed = personDocumentModelOutputSchema.safeParse(
      await this.provider.analyze(input),
    );
    if (!parsed.success) {
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_FAILED",
        "Document extraction returned unusable data.",
        true,
      );
    }

    const raw = parsed.data;
    const warnings = new Set(raw.warnings);
    const slots = new Set(input.sources.map((source) => source.slot));
    if (
      [...raw.suggestions, ...raw.licenseCategories].some(
        (item) => !slots.has(item.sourceSlot),
      )
    ) {
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_INVALID_SOURCE",
        "Document extraction referenced a missing source.",
        false,
      );
    }

    if (raw.detectedDocumentType !== input.documentType) {
      warnings.add(
        raw.detectedDocumentType === null ? "noData" : "typeMismatch",
      );
      return {
        detectedDocumentType: raw.detectedDocumentType,
        suggestions: [],
        licenseCategories: [],
        warnings: [...warnings],
      };
    }
    // A model-reported mismatch must also prevent autofill even if its type
    // field contradicts its own warning (for example, mixed document photos).
    if (warnings.has("typeMismatch")) {
      return {
        detectedDocumentType: raw.detectedDocumentType,
        suggestions: [],
        licenseCategories: [],
        warnings: [...warnings],
      };
    }

    // Check the printed section before resolving counties/localities: a birth
    // county must never become context for a domicile locality.
    const residentialSuggestions =
      raw.suggestions.flatMap<v1.persons.PersonDocumentExtractionSuggestion>(
        (suggestion) => {
          if (suggestion.target !== "person") return [suggestion];
          const { addressEvidence, ...publicSuggestion } = suggestion;
          if (
            ADDRESS_FIELDS.has(suggestion.field) &&
            !hasResidentialEvidence(addressEvidence, input)
          ) {
            warnings.add("invalidValue");
            return [];
          }
          return [publicSuggestion];
        },
      );

    let suggestions: v1.persons.PersonDocumentExtractionSuggestion[] = [];
    for (const rawSuggestion of normalizePersonAddressSuggestions(
      residentialSuggestions,
      input.documentType,
    )) {
      const suggestion =
        rawSuggestion.field === "cnp"
          ? {
              ...rawSuggestion,
              target: "person" as const,
              field: "cnp" as const,
            }
          : rawSuggestion;
      const fieldSchema =
        suggestion.target === "person"
          ? v1.persons.createPersonInputSchema.shape[suggestion.field]
          : v1.persons.createPersonDocumentInputSchema.shape[suggestion.field];
      const normalized = fieldSchema.safeParse(
        suggestion.target === "person" &&
          (suggestion.field === "firstName" || suggestion.field === "lastName")
          ? capitalizeExtractedName(suggestion.value)
          : suggestion.value.trim(),
      );
      if (!normalized.success || typeof normalized.data !== "string") {
        warnings.add("invalidValue");
        continue;
      }
      if (
        suggestion.target === "document" &&
        suggestion.field === "issuedOn" &&
        v1.common.isFutureDateOnly(normalized.data)
      ) {
        warnings.add("invalidValue");
        continue;
      }
      if (
        (suggestion.field === "countryCode" ||
          suggestion.field === "issuingCountryCode") &&
        !isRecognizedCountryCode(normalized.data)
      ) {
        warnings.add("invalidValue");
        continue;
      }
      const duplicate = suggestions.find(
        (existing) =>
          existing.target === suggestion.target &&
          existing.field === suggestion.field &&
          existing.value === normalized.data &&
          existing.sourceSlot === suggestion.sourceSlot,
      );
      if (duplicate) {
        duplicate.needsReview ||= suggestion.needsReview;
        continue;
      }
      suggestions.push({ ...suggestion, value: normalized.data });
    }

    const birthDates = suggestions.filter(
      (item) => item.target === "person" && item.field === "dateOfBirth",
    );
    const cnps = suggestions.filter(
      (item) => item.target === "person" && item.field === "cnp",
    );
    if (
      cnps.some((cnp) =>
        birthDates.some(
          (birthDate) =>
            v1.persons.getDateOfBirthFromCnp(cnp.value) !== birthDate.value,
        ),
      )
    ) {
      warnings.add("conflictingSources");
      suggestions = suggestions.filter(
        (item) => item.field !== "cnp" && item.field !== "dateOfBirth",
      );
    }

    const issuedOn = suggestions.filter(
      (item) => item.target === "document" && item.field === "issuedOn",
    );
    const expiresOn = suggestions.filter(
      (item) => item.target === "document" && item.field === "expiresOn",
    );
    if (
      issuedOn.some((issue) =>
        expiresOn.some((expiry) => expiry.value < issue.value),
      )
    ) {
      warnings.add("invalidValue");
      suggestions = suggestions.filter(
        (item) =>
          item.target !== "document" ||
          (item.field !== "issuedOn" && item.field !== "expiresOn"),
      );
    }
    suggestions = suggestions.map((item) => {
      const conflict = suggestions.some(
        (other) =>
          other.target === item.target &&
          other.field === item.field &&
          other.value !== item.value,
      );
      if (conflict) warnings.add("conflictingSources");
      return { ...item, needsReview: item.needsReview || conflict };
    });

    const licenseCategories: v1.persons.PersonDocumentExtractionContent["licenseCategories"] =
      [];
    const conflictingCategories = new Set<string>();
    for (const row of raw.licenseCategories) {
      const normalized =
        v1.persons.personDriverLicenseCategoryEntrySchema.safeParse(row.value);
      if (
        input.documentType !== "driverLicense" ||
        !normalized.success ||
        (!normalized.data.issuedOn && !normalized.data.expiresOn) ||
        (normalized.data.issuedOn &&
          v1.common.isFutureDateOnly(normalized.data.issuedOn))
      ) {
        warnings.add("invalidValue");
        continue;
      }
      const duplicate = licenseCategories.find(
        (entry) => entry.value.category === normalized.data.category,
      );
      if (duplicate) {
        if (
          JSON.stringify(duplicate.value) !== JSON.stringify(normalized.data)
        ) {
          conflictingCategories.add(normalized.data.category);
          warnings.add("conflictingSources");
        }
        continue;
      }
      licenseCategories.push({
        value: normalized.data,
        sourceSlot: row.sourceSlot,
        needsReview: true,
      });
    }
    const consistentCategories = licenseCategories.filter(
      (entry) => !conflictingCategories.has(entry.value.category),
    );
    if (!suggestions.length && !consistentCategories.length)
      warnings.add("noData");

    // Apply the response limit after conflict detection so truncation cannot
    // turn an ambiguous value into a confident autofill.
    if (suggestions.length > 64) {
      warnings.add("invalidValue");
      suggestions = suggestions.slice(0, 64);
    }

    return v1.persons.personDocumentExtractionContentSchema.parse({
      detectedDocumentType: raw.detectedDocumentType,
      suggestions,
      licenseCategories: consistentCategories,
      warnings: [...warnings],
    });
  }
}

const ADDRESS_FIELDS = new Set([
  "countryCode",
  "region",
  "city",
  "addressLine1",
  "addressLine2",
  "postalCode",
]);

function hasResidentialEvidence(
  evidence: { section: string; label: string } | null,
  input: AnalyzePersonDocumentInput,
): boolean {
  if (
    !evidence ||
    !["domicile", "residence"].includes(evidence.section) ||
    (input.documentType === "nationalId" &&
      input.nationalIdFormat === "electronic")
  )
    return false;

  const label = evidence.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/naster|naissance|birth|emitent|eliberat|issuing|issuer/.test(label))
    return false;
  // Old Romanian IDs print two places. Only the second, explicitly labelled
  // Domiciliu (not Loc naștere), establishes the person's address.
  return input.documentType === "nationalId"
    ? /\b(domiciliu\w*|resedinta)\b/.test(label)
    : /\b(domicil\w*|residen\w*|resedinta|address|adresse)\b/.test(label);
}

function validateSources(input: AnalyzePersonDocumentInput): void {
  if (
    input.sources.length < 1 ||
    input.sources.length > 3 ||
    new Set(input.sources.map((source) => source.slot)).size !==
      input.sources.length ||
    input.sources.some((source) => source.bytes.byteLength === 0)
  ) {
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      "One to three distinct, nonempty document sources are required.",
      false,
    );
  }
  if (
    input.sources.some(
      (source) =>
        source.bytes.byteLength > PERSON_DOCUMENT_EXTRACTION_MAX_SOURCE_BYTES,
    )
  ) {
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "Document extraction accepts up to 10 MiB per source.",
      false,
    );
  }
  if (
    input.sources.some(
      (source) =>
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          source.contentType,
        ) ||
        (source.contentType === "application/pdf" &&
          input.documentType !== "proofOfAddress"),
    )
  ) {
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
      "Use a JPEG, PNG or WebP image, or a PDF for proof of address.",
      false,
    );
  }
}

const regionNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none",
});
function isRecognizedCountryCode(value: string): boolean {
  // Reject unknown/user-assigned region codes and non-country CLDR groups.
  return (
    /^[A-Z]{2}$/.test(value) &&
    !["ZZ", "EU", "UN", "QO", "XA", "XB"].includes(value) &&
    regionNames.of(value) !== undefined
  );
}
