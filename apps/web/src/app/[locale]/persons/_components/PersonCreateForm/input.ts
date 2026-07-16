import { v1 } from "@repo/api-shared";
import { buildDateOnly } from "@repo/ui/lib/date-parts";

import { documentFieldErrorKey } from "./errors";
import { isBlankOptionalDocument } from "./form-state";
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
    email: form.email,
    phone: normalizePhoneForSubmit(form),
    firstName: form.firstName,
    lastName: form.lastName,
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
    const nationalId = form.documents.find(
      (document) => document.type === "nationalId",
    );
    const dateOfBirth = v1.persons.getDateOfBirthFromCnp(nationalId?.cnp);

    addOptional(input, "dateOfBirth", dateOfBirth ?? undefined);
  }

  addOptional(input, "addressLine1", form.addressLine1);
  addOptional(input, "addressLine2", form.addressLine2);
  addOptional(input, "city", form.city);
  addOptional(input, "region", form.region);
  addOptional(input, "postalCode", form.postalCode);
  addOptional(input, "countryCode", form.countryCode);
  const documents: Record<string, unknown>[] = [];

  for (const document of form.documents) {
    if (!document.required && isBlankOptionalDocument(document)) {
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
    field: Extract<PersonDocumentFormFieldKey, "issuedOn" | "expiresOn">;
    dateField: Extract<DateField, "documentIssuedOn" | "documentExpiresOn">;
    kind: "incomplete" | "invalid";
  };
} {
  const input: Record<string, unknown> = {
    type: document.type,
    status: document.status,
  };
  const issuedOn = buildDateOnly(document.issuedOn);
  const expiresOn = buildDateOnly(document.expiresOn);

  if (issuedOn.error) {
    return {
      input,
      error: {
        field: "issuedOn",
        dateField: "documentIssuedOn",
        kind: issuedOn.error,
      },
    };
  }

  if (expiresOn.error) {
    return {
      input,
      error: {
        field: "expiresOn",
        dateField: "documentExpiresOn",
        kind: expiresOn.error,
      },
    };
  }

  addOptional(input, "series", document.series);
  addOptional(input, "number", document.number);
  if (document.required && document.type === "nationalId") {
    input.cnp = document.cnp;
  } else {
    addOptional(input, "cnp", document.cnp);
  }
  addOptional(input, "issuingCountryCode", document.issuingCountryCode);
  addOptional(input, "issuedBy", document.issuedBy);
  addOptional(input, "issuedOn", issuedOn.value);
  addOptional(input, "expiresOn", expiresOn.value);
  addOptional(input, "notes", document.notes);
  const photoTokens = documentPhotoUploadTokens(document.photos);
  if (Object.keys(photoTokens).length > 0) {
    input.photos = photoTokens;
  }

  return { input };
}

function documentPhotoUploadTokens(
  photos: PersonDocumentPhotoDraftUploads,
): Partial<Record<v1.persons.PersonDocumentPhotoSlot, string>> {
  const tokens: Partial<Record<v1.persons.PersonDocumentPhotoSlot, string>> =
    {};

  for (const slot of v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS) {
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
