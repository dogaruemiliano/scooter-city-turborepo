import { v1 } from "@repo/api-shared";
import { buildDateOnly } from "@repo/ui/lib/date-parts";

import { documentFieldErrorKey } from "./errors";
import {
  documentPhotoSlots,
  documentWorkflow,
  isBlankDocumentDraft,
} from "./form-state";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  DateField,
  FieldValidationError,
  PersonDocumentFormFieldKey,
  PersonDocumentPhotoDraftUploads,
} from "./types";

export function createPersonInput(
  form: CreatePersonFormState,
  formatDateError: (
    field: DateField,
    error: "incomplete" | "invalid",
  ) => string,
): { input?: Record<string, unknown>; error?: FieldValidationError } {
  const input: Record<string, unknown> = {
    documentWorkflow: documentWorkflow(form),
    email: form.email,
    phone: normalizePhoneForSubmit(form),
    firstName: form.firstName,
    lastName: form.lastName,
    ...(form.cnp.trim() || form.citizenship === "romanian"
      ? { cnp: form.cnp }
      : {}),
  };

  if (form.citizenship === "foreign") {
    const dateOfBirth = buildDateOnly(form.dateOfBirth);
    if (dateOfBirth.error) {
      return {
        error: {
          field: "dateOfBirth",
          message: formatDateError("dateOfBirth", dateOfBirth.error),
        },
      };
    }

    addOptional(input, "dateOfBirth", dateOfBirth.value);
  } else {
    const dateOfBirth = v1.persons.getDateOfBirthFromCnp(form.cnp);

    addOptional(input, "dateOfBirth", dateOfBirth ?? undefined);
  }

  addOptional(input, "addressLine1", form.addressLine1);
  addOptional(input, "addressLine2", form.addressLine2);
  addOptional(input, "city", form.city);
  addOptional(input, "region", form.region);
  addOptional(
    input,
    "countryCode",
    form.citizenship === "romanian" ? "RO" : form.countryCode,
  );
  const documents: Record<string, unknown>[] = [];

  for (const document of form.documents) {
    if (!document.required && isBlankDocumentDraft(document)) {
      continue;
    }

    const documentInput = createDocumentInput(document);

    if (documentInput.error) {
      return {
        error: {
          field: documentFieldErrorKey(document.key, documentInput.error.field),
          message: formatDateError(
            documentInput.error.dateField,
            documentInput.error.kind,
          ),
        },
      };
    }

    documents.push(documentInput.input);
  }

  if (documents.length > 0) {
    input.documents = documents;
  }
  addOptional(input, "notes", form.notes);

  return { input };
}

function createDocumentInput(document: CreatePersonDocumentFormState): {
  input: Record<string, unknown>;
  error?: {
    field: Extract<PersonDocumentFormFieldKey, "expiresOn">;
    dateField: Extract<DateField, "documentExpiresOn">;
    kind: "incomplete" | "invalid";
  };
} {
  const input: Record<string, unknown> = {
    type: document.type,
    // Completing this admin form confirms review of every attached document.
    status: "verified",
  };
  const expiresOn = buildDateOnly(document.expiresOn);

  if (document.hasExpiryDate && expiresOn.error) {
    return {
      input,
      error: {
        field: "expiresOn",
        dateField: "documentExpiresOn",
        kind: expiresOn.error,
      },
    };
  }

  if (document.type === "nationalId")
    input.nationalIdFormat = document.nationalIdFormat;
  if (document.type === "driverLicense")
    input.licenseCategories = document.licenseCategories;
  if (document.type !== "proofOfAddress") {
    addOptional(input, "series", document.series);
    addOptional(input, "number", document.number);
  }
  addOptional(input, "issuingCountryCode", document.issuingCountryCode);
  input.expiresOn =
    document.type !== "proofOfAddress" && document.hasExpiryDate
      ? expiresOn.value
      : null;
  addOptional(input, "notes", document.notes);
  const photoTokens = documentPhotoUploadTokens(
    document.photos,
    documentPhotoSlots(document),
  );
  if (Object.keys(photoTokens).length > 0) {
    input.photos = photoTokens;
  }

  return { input };
}

function documentPhotoUploadTokens(
  photos: PersonDocumentPhotoDraftUploads,
  slots: readonly v1.persons.PersonDocumentPhotoSlot[],
): Partial<Record<v1.persons.PersonDocumentPhotoSlot, string>> {
  const tokens: Partial<Record<v1.persons.PersonDocumentPhotoSlot, string>> =
    {};

  for (const slot of slots) {
    const photo = photos[slot];
    if (photo?.status === "uploaded") {
      tokens[slot] = photo.uploadToken;
    }
  }

  return tokens;
}

function addOptional(
  input: Record<string, unknown>,
  key: string,
  value: string | undefined,
) {
  if (value && value.trim().length > 0) {
    input[key] = value;
  }
}

function normalizePhoneForSubmit(form: CreatePersonFormState): string {
  const nationalNumber =
    form.phoneCountry === "RO" && form.phoneNationalNumber.startsWith("0")
      ? form.phoneNationalNumber.slice(1)
      : form.phoneNationalNumber;

  if (nationalNumber.length === 0) {
    return form.phone;
  }

  return `+${form.phoneCountryCallingCode}${nationalNumber}`;
}
