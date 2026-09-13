import { v1 } from "@repo/api-shared";
import { buildDateOnly, dateOnlyToDateParts } from "@repo/ui/lib/date-parts";

import { ROMANIAN_COUNTIES } from "./constants";
import { hasKnownRomanianCountry } from "./form-state";
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
  missing?: boolean;
  preferredDocumentKey?: string;
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
  replacements?: Record<string, ExtractionFieldKey[]>;
}

export function createExtractionState(
  form: CreatePersonFormState,
): ExtractionState {
  return {
    form:
      form.citizenship === "romanian" ? { ...form, countryCode: "RO" } : form,
    touched: {},
    fields: {},
    readings: {},
    autofilled: {},
  };
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
  const document = state.form.documents.find(
    (item) => item.key === documentKey,
  );
  if (
    !state.readings[documentKey] &&
    !Object.values(document?.photos ?? {}).some(Boolean)
  )
    return state;
  const replacedFields = state.readings[documentKey]
    ? (Object.keys(
        collectCandidates({
          ...state,
          readings: { [documentKey]: state.readings[documentKey]! },
        }),
      ) as ExtractionFieldKey[])
    : document
      ? expectedExtractionFields(document)
      : [];
  const readings = { ...state.readings };
  delete readings[documentKey];
  const next = reconcile({
    ...state,
    readings,
    replacements: {
      ...state.replacements,
      [documentKey]: [
        ...new Set([
          ...(state.replacements?.[documentKey] ?? []),
          ...replacedFields,
        ]),
      ],
    },
  });
  for (const key of replacedFields) {
    next.fields[key] = { suggestions: [], ...next.fields[key], outdated: true };
  }
  return next;
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
  let next = state;
  const replacement = state.replacements?.[reading.documentKey];
  if (replacement) {
    // A replacement owns its newly read values, including prior manual corrections.
    // Retain manual corrections when a value is unreadable, but mark them as stale.
    const incoming = collectCandidates({
      ...state,
      readings: { [reading.documentKey]: reading },
    });
    const touched = { ...state.touched };
    const autofilled = { ...state.autofilled };
    const fields = { ...state.fields };
    let form =
      state.form.citizenship === "romanian"
        ? { ...state.form, countryCode: "RO" as const }
        : state.form;
    for (const rawKey of Object.keys(incoming)) {
      const key = rawKey as ExtractionFieldKey;
      if (groupSuggestions(incoming[key] ?? []).length !== 1) continue;
      delete touched[key];
      delete autofilled[key];
      if (key.endsWith(".expiresOn"))
        delete touched[`document.${documentKeyFromField(key)}.hasExpiryDate`];
      fields[key] = {
        suggestions: [],
        outdated: false,
        ...fields[key],
        preferredDocumentKey: reading.documentKey,
      };
      form = writeField(
        form,
        key,
        key.endsWith(".licenseCategories") ? [] : "",
      );
    }
    next = { ...state, form, touched, autofilled, fields };
  }
  next = reconcile({
    ...next,
    readings: { ...state.readings, [reading.documentKey]: reading },
  });
  if (replacement) {
    for (const key of replacement) {
      const supplied = next.fields[key]?.suggestions.some((suggestion) =>
        suggestion.sources.some(
          (source) => source.documentKey === reading.documentKey,
        ),
      );
      if (!supplied)
        next.fields[key] = { ...next.fields[key]!, outdated: true };
    }
    const replacements = { ...next.replacements };
    delete replacements[reading.documentKey];
    next = { ...next, replacements };
  }
  return next;
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
  if (
    key === "person.city" &&
    state.form.countryCode === "RO" &&
    typeof value === "string"
  ) {
    const matched = v1.persons.matchRomanianLocality(state.form.region, value);
    if (!matched) return state;
    value = matched;
  }
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
  if (
    (key === "person.countryCode" || key === "person.region") &&
    !equalValues(previous, value)
  ) {
    next = markExtractionFieldEdited(
      { ...next, form: { ...next.form, city: "" } },
      "person.city",
    );
  }
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
  let form =
    state.form.citizenship === "romanian"
      ? { ...state.form, countryCode: "RO" as const }
      : state.form;
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
    ...Object.values(state.readings).flatMap((reading) => {
      const document = form.documents.find(
        (item) => item.key === reading.documentKey,
      );
      return document ? expectedExtractionFields(document) : [];
    }),
  ] as ExtractionFieldKey[]);
  // Address country determines whether the county needs Romanian normalization.
  const addressOrder = (key: ExtractionFieldKey) =>
    key === "person.countryCode" ? 0 : key === "person.region" ? 1 : 2;
  const orderedKeys = [...keys].sort(
    (left, right) => addressOrder(left) - addressOrder(right),
  );
  for (const key of orderedKeys) {
    if (hasKnownRomanianCountry(form, key)) continue;
    const suggestions = groupSuggestions(
      (candidates[key] ?? []).map((candidate) => {
        if (
          key !== "person.city" ||
          form.countryCode !== "RO" ||
          typeof candidate.value !== "string"
        )
          return candidate;
        const matched = v1.persons.matchRomanianLocality(
          form.region,
          candidate.value,
        );
        return {
          ...candidate,
          value: matched ?? candidate.value,
          needsReview: candidate.needsReview || !matched,
        };
      }),
    );
    const before = readExtractionFieldValue(form, key);
    const preferredDocumentKey = state.fields[key]?.preferredDocumentKey;
    const preferred = preferredDocumentKey
      ? suggestions.filter((suggestion) =>
          suggestion.sources.some(
            (source) => source.documentKey === preferredDocumentKey,
          ),
        )
      : [];
    const candidate =
      preferred.length === 1
        ? preferred[0]
        : suggestions.length === 1
          ? suggestions[0]
          : undefined;
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
    const unknownRomanianLocality =
      key === "person.city" &&
      form.countryCode === "RO" &&
      candidate &&
      (typeof candidate.value !== "string" ||
        !v1.persons.matchRomanianLocality(form.region, candidate.value));
    if (
      candidate &&
      !unknownRomanianLocality &&
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
      ...(preferredDocumentKey ? { preferredDocumentKey } : {}),
      missing: !candidate && isAvailableForAutofill(current, key),
      ...(provenance?.length ? { provenance } : {}),
      outdated: Boolean(
        (state.fields[key]?.outdated && !matching) ||
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

/** Fields that the selected document is expected to supply, never absent optional documents. */
function expectedExtractionFields(
  document: CreatePersonDocumentFormState,
): ExtractionFieldKey[] {
  const address: ExtractionFieldKey[] = [
    "person.addressLine1",
    "person.region",
    "person.city",
    "person.countryCode",
  ];
  if (document.type === "proofOfAddress") return address;
  const fields: ExtractionFieldKey[] = [
    `document.${document.key}.number`,
    `document.${document.key}.issuingCountryCode`,
  ];
  if (document.hasExpiryDate) fields.push(`document.${document.key}.expiresOn`);
  if (document.type === "nationalId" || document.type === "passport") {
    fields.push(
      "person.firstName",
      "person.lastName",
      document.type === "nationalId" ? "person.cnp" : "person.dateOfBirth",
    );
  }
  if (
    document.type === "nationalId" &&
    document.nationalIdFormat !== "electronic"
  )
    fields.push(`document.${document.key}.series`, ...address);
  return fields;
}

export function extractionFieldNeedsReview(
  state: ExtractionState,
  key: ExtractionFieldKey,
): boolean {
  if (hasKnownRomanianCountry(state.form, key)) return false;
  const review = state.fields[key];
  if (!review) return false;
  return (
    review.outdated ||
    (!state.touched[key] &&
      Boolean(
        review.missing ||
        review.suggestions.length > 1 ||
        review.suggestions.some(
          (suggestion) =>
            suggestion.needsReview ||
            !equalValues(
              suggestion.value,
              readExtractionFieldValue(state.form, key),
            ),
        ),
      ))
  );
}

function collectCandidates(state: ExtractionState) {
  const candidates: Partial<
    Record<ExtractionFieldKey, ExtractionSuggestion[]>
  > = {};
  for (const reading of Object.values(state.readings)) {
    const document = state.form.documents.find(
      (item) => item.key === reading.documentKey,
    );
    if (!document || reading.result.detectedDocumentType !== document.type)
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
      // A licence name is comparison evidence, never a replacement for the ID name.
      if (
        document.type === "driverLicense" &&
        suggestion.target === "person" &&
        (suggestion.field === "firstName" || suggestion.field === "lastName")
      )
        continue;
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
      : field === "expiresOn" && "expiresOn" in target
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
  if (key === "person.countryCode" && form.citizenship === "romanian")
    return { ...form, countryCode: "RO" };
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
  const isDate = field === "expiresOn";
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

export const normalizeRomanianCounty = v1.persons.normalizeRomanianCounty;
