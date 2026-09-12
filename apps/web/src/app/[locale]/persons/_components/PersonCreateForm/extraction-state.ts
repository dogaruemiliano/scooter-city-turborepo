import { v1 } from "@repo/api-shared";
import { buildDateOnly, dateOnlyToDateParts } from "@repo/ui/lib/date-parts";

import { ROMANIAN_COUNTIES } from "./constants";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  PersonDocumentFormFieldKey,
  PersonFormFieldKey,
} from "./types";

export type ExtractionFieldKey =
  | `person.${PersonFormFieldKey}`
  | `document.${string}.${PersonDocumentFormFieldKey}`;
export type ExtractionValue =
  | string
  | v1.persons.PersonDriverLicenseCategoryEntry[];

export interface ExtractionProvenance {
  documentKey: string;
  documentType: v1.persons.PersonDocumentType;
  sourceSlot: v1.persons.PersonDocumentPhotoSlot;
  sourceSignature: string;
  needsReview: boolean;
}

export interface ExtractionSuggestion {
  id: string;
  value: ExtractionValue;
  sources: ExtractionProvenance[];
  needsReview: boolean;
}

export interface ExtractionFieldReview {
  provenance?: ExtractionProvenance[];
  outdated: boolean;
  suggestions: ExtractionSuggestion[];
}

interface DocumentReading {
  documentKey: string;
  sourceSignature: string;
  result: v1.persons.PersonDocumentExtraction;
}

interface AutofilledValue {
  value: ExtractionValue;
  previousValue: ExtractionValue;
  previousHasExpiryDate?: boolean;
}

export interface ExtractionState {
  form: CreatePersonFormState;
  touched: Partial<Record<ExtractionFieldKey, true>>;
  fields: Partial<Record<ExtractionFieldKey, ExtractionFieldReview>>;
  readings: Record<string, DocumentReading>;
  autofilled: Partial<Record<ExtractionFieldKey, AutofilledValue>>;
}

export function createExtractionState(
  form: CreatePersonFormState,
): ExtractionState {
  return { form, touched: {}, fields: {}, readings: {}, autofilled: {} };
}

/** Call after applying an operator edit, including an intentional empty value. */
export function markExtractionFieldEdited(
  state: ExtractionState,
  key: ExtractionFieldKey,
): ExtractionState {
  const autofilled = { ...state.autofilled };
  delete autofilled[key];
  const review = state.fields[key];
  const matching = review?.suggestions.find((item) =>
    equalValues(item.value, readExtractionFieldValue(state.form, key)),
  );
  return {
    ...state,
    touched: { ...state.touched, [key]: true },
    autofilled,
    fields: review
      ? {
          ...state.fields,
          [key]: { ...review, provenance: matching?.sources, outdated: false },
        }
      : state.fields,
  };
}

/** Invalidate immediately on replacement/removal; never await the new request. */
export function invalidateDocumentExtraction(
  state: ExtractionState,
  documentKey: string,
): ExtractionState {
  if (!state.readings[documentKey]) return state;
  const readings = { ...state.readings };
  delete readings[documentKey];
  return reconcile({ ...state, readings });
}

/** The request owner must check its generation and source signature first. */
export function reconcileDocumentExtraction(
  state: ExtractionState,
  reading: DocumentReading,
): ExtractionState {
  const document = state.form.documents.find(
    (item) => item.key === reading.documentKey,
  );
  if (!document || document.type !== reading.result.documentType) return state;
  return reconcile({
    ...state,
    readings: { ...state.readings, [reading.documentKey]: reading },
  });
}

export function applyExtractionSuggestion(
  state: ExtractionState,
  key: ExtractionFieldKey,
  suggestionId: string,
): ExtractionState {
  const suggestion = state.fields[key]?.suggestions.find(
    (item) => item.id === suggestionId,
  );
  if (!suggestion) return state;
  let value = suggestion.value;
  const previous = readExtractionFieldValue(state.form, key);
  if (Array.isArray(value) && Array.isArray(previous)) {
    const suggestedCategories = new Set(value.map((row) => row.category));
    value = [
      ...previous.filter((row) => !suggestedCategories.has(row.category)),
      ...value,
    ];
  }
  let next = markExtractionFieldEdited(
    { ...state, form: writeField(state.form, key, value) },
    key,
  );
  if (key === "person.countryCode" && !equalValues(previous, value)) {
    // Match the normal country picker: a region belonging to the old country
    // must not survive an explicit country change under a different control.
    next = markExtractionFieldEdited(
      { ...next, form: { ...next.form, region: "" } },
      "person.region",
    );
  }
  return {
    ...next,
    fields: {
      ...next.fields,
      [key]: {
        ...next.fields[key]!,
        provenance: suggestion.sources,
        outdated: false,
      },
    },
  };
}

function reconcile(state: ExtractionState): ExtractionState {
  let form = state.form;
  const touched = { ...state.touched };
  // Restore only values we still own before recomputing all available sources.
  // This makes the final result independent of request completion order.
  for (const [rawKey, previous] of Object.entries(state.autofilled)) {
    const key = rawKey as ExtractionFieldKey;
    if (!previous || touched[key]) continue;
    if (!equalValues(readExtractionFieldValue(form, key), previous.value)) {
      touched[key] = true;
      continue;
    }
    form = writeField(form, key, previous.previousValue);
    if (
      previous.previousHasExpiryDate !== undefined &&
      !touched[`document.${documentKeyFromField(key)}.hasExpiryDate`]
    ) {
      form = updateDocument(form, documentKeyFromField(key), {
        hasExpiryDate: previous.previousHasExpiryDate,
      });
    }
  }

  const candidates = collectCandidates(state);
  const fields: ExtractionState["fields"] = {};
  const autofilled: ExtractionState["autofilled"] = {};
  const keys = new Set([
    ...Object.keys(state.fields),
    ...Object.keys(candidates),
  ] as ExtractionFieldKey[]);
  // Address country determines whether the county needs Romanian normalization.
  const orderedKeys = [...keys].sort((left, right) =>
    left === "person.countryCode" ? -1 : right === "person.countryCode" ? 1 : 0,
  );
  for (const key of orderedKeys) {
    const suggestions = groupSuggestions(candidates[key] ?? []);
    const before = readExtractionFieldValue(form, key);
    const candidate = suggestions.length === 1 ? suggestions[0] : undefined;
    const expiryManuallyDisabled =
      key.endsWith(".expiresOn") &&
      touched[`document.${documentKeyFromField(key)}.hasExpiryDate`] &&
      form.documents.find(
        (document) => document.key === documentKeyFromField(key),
      )?.hasExpiryDate === false;
    const unknownRomanianCounty =
      key === "person.region" &&
      form.countryCode === "RO" &&
      candidate &&
      !ROMANIAN_COUNTIES.some((county) => county === candidate.value);
    if (
      candidate &&
      !touched[key] &&
      !expiryManuallyDisabled &&
      !unknownRomanianCounty &&
      isAvailableForAutofill(before, key)
    ) {
      autofilled[key] = {
        value: candidate.value,
        previousValue: before ?? "",
        ...(key.endsWith(".expiresOn")
          ? {
              previousHasExpiryDate: form.documents.find(
                (document) => document.key === documentKeyFromField(key),
              )?.hasExpiryDate,
            }
          : {}),
      };
      form = writeField(form, key, candidate.value);
    }
    const current = readExtractionFieldValue(form, key);
    const matching = suggestions.find((item) =>
      equalValues(item.value, current),
    );
    const oldProvenance = state.fields[key]?.provenance;
    const provenance = matching?.sources ?? oldProvenance;
    fields[key] = {
      suggestions,
      ...(provenance?.length ? { provenance } : {}),
      outdated: Boolean(
        provenance?.some(
          (source) =>
            state.readings[source.documentKey]?.sourceSignature !==
            source.sourceSignature,
        ),
      ),
    };
  }
  return { ...state, form, touched, fields, autofilled };
}

function collectCandidates(state: ExtractionState) {
  const candidates: Partial<
    Record<ExtractionFieldKey, ExtractionSuggestion[]>
  > = {};
  for (const reading of Object.values(state.readings)) {
    const document = state.form.documents.find(
      (item) => item.key === reading.documentKey,
    );
    if (
      !document ||
      reading.result.detectedDocumentType !== document.type ||
      reading.result.warnings.includes("typeMismatch")
    )
      continue;
    const source = (
      slot: v1.persons.PersonDocumentPhotoSlot,
      needsReview: boolean,
    ): ExtractionProvenance => ({
      documentKey: document.key,
      documentType: document.type,
      sourceSlot: slot,
      sourceSignature: reading.sourceSignature,
      needsReview,
    });
    for (const suggestion of reading.result.suggestions) {
      const key: ExtractionFieldKey =
        suggestion.field === "cnp"
          ? "person.cnp"
          : suggestion.target === "person"
            ? `person.${suggestion.field}`
            : `document.${document.key}.${suggestion.field}`;
      const value =
        key === "person.region"
          ? normalizeRomanianCounty(suggestion.value)
          : suggestion.value;
      (candidates[key] ??= []).push({
        id: "",
        value,
        sources: [source(suggestion.sourceSlot, suggestion.needsReview)],
        needsReview: suggestion.needsReview,
      });
    }
    if (
      document.type === "driverLicense" &&
      reading.result.licenseCategories.length
    ) {
      const key: ExtractionFieldKey = `document.${document.key}.licenseCategories`;
      (candidates[key] ??= []).push({
        id: "",
        value: reading.result.licenseCategories.map((row) => row.value),
        sources: reading.result.licenseCategories.map((row) =>
          source(row.sourceSlot, true),
        ),
        needsReview: true,
      });
    }
  }
  return candidates;
}

function groupSuggestions(candidates: ExtractionSuggestion[]) {
  const groups: ExtractionSuggestion[] = [];
  for (const candidate of candidates) {
    const existing = groups.find((item) =>
      equalValues(item.value, candidate.value),
    );
    if (existing) {
      existing.sources.push(...candidate.sources);
      existing.needsReview ||= candidate.needsReview;
    } else {
      groups.push({ ...candidate, sources: [...candidate.sources] });
    }
  }
  return groups.map((group, index) => ({
    ...group,
    // IDs contain no upload token or extracted document content.
    id: `${group.sources[0]!.documentKey}:${group.sources[0]!.sourceSignature}:${index}`,
    needsReview: group.needsReview || groups.length > 1,
  }));
}

function isAvailableForAutofill(
  value: ExtractionValue | undefined,
  key: ExtractionFieldKey,
) {
  return (
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (value === "RO" &&
      (key === "person.countryCode" || key.endsWith(".issuingCountryCode")))
  );
}

function equalValues(
  left: ExtractionValue | undefined,
  right: ExtractionValue | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function documentKeyFromField(key: ExtractionFieldKey): string {
  return key.slice("document.".length, key.lastIndexOf("."));
}

export function readExtractionFieldValue(
  form: CreatePersonFormState,
  key: ExtractionFieldKey,
): ExtractionValue | undefined {
  const field = key.slice(key.lastIndexOf(".") + 1);
  const target = key.startsWith("person.")
    ? form
    : form.documents.find((item) => item.key === documentKeyFromField(key));
  if (!target || !(field in target)) return undefined;
  if (field === "licenseCategories" && "licenseCategories" in target)
    return target.licenseCategories;
  const parts =
    field === "dateOfBirth" && "dateOfBirth" in target
      ? target.dateOfBirth
      : (field === "issuedOn" || field === "expiresOn") && "issuedOn" in target
        ? target[field]
        : null;
  if (parts) {
    const date = buildDateOnly(parts);
    return date.error ? JSON.stringify(parts) : (date.value ?? "");
  }
  const value = target[field as keyof typeof target];
  if (typeof value === "string") return value;
  return undefined;
}

function writeField(
  form: CreatePersonFormState,
  key: ExtractionFieldKey,
  value: ExtractionValue,
): CreatePersonFormState {
  const field = key.slice(key.lastIndexOf(".") + 1);
  if (key.startsWith("person.") && typeof value === "string") {
    if (
      !v1.persons.PERSON_EXTRACTION_PERSON_FIELDS.some((item) => item === field)
    )
      return form;
    return {
      ...form,
      [field]: field === "dateOfBirth" ? dateOnlyToDateParts(value) : value,
    };
  }
  if (field === "licenseCategories" && Array.isArray(value)) {
    return updateDocument(form, documentKeyFromField(key), {
      licenseCategories: value,
    });
  }
  if (
    typeof value !== "string" ||
    !v1.persons.PERSON_EXTRACTION_DOCUMENT_FIELDS.some((item) => item === field)
  )
    return form;
  const isDate = field === "issuedOn" || field === "expiresOn";
  return updateDocument(form, documentKeyFromField(key), {
    [field]: isDate ? dateOnlyToDateParts(value) : value,
    ...(field === "expiresOn" && value ? { hasExpiryDate: true } : {}),
  });
}

function updateDocument(
  form: CreatePersonFormState,
  key: string,
  patch: Partial<CreatePersonDocumentFormState>,
): CreatePersonFormState {
  return {
    ...form,
    documents: form.documents.map((document) =>
      document.key === key ? { ...document, ...patch } : document,
    ),
  };
}

export function normalizeRomanianCounty(value: string): string {
  const normalized = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/^(judetul|jud\.?|municipiul)\s+/u, "")
      .replace(/[\s-]/gu, "");
  return (
    ROMANIAN_COUNTIES.find(
      (county) => normalized(county) === normalized(value),
    ) ?? value
  );
}
