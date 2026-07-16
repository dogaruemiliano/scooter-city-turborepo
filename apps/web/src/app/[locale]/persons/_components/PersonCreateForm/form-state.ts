import { v1 } from "@repo/api-shared";
import {
  buildDateOnly,
  emptyDateParts,
  hasDateParts,
} from "@repo/ui/lib/date-parts";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  PersonCitizenship,
} from "./types";

export function createEmptyCreateForm(
  citizenship: PersonCitizenship,
): CreatePersonFormState {
  return {
    citizenship,
    email: "",
    phone: "",
    phoneCountry: "RO",
    phoneCountryCallingCode: "40",
    phoneNationalNumber: "",
    firstName: "",
    lastName: "",
    dateOfBirth: emptyDateParts(),
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "RO",
    documents: createInitialDocuments(citizenship),
    notes: "",
  };
}

export function createInitialDocuments(
  citizenship: PersonCitizenship,
): CreatePersonDocumentFormState[] {
  return citizenship === "romanian"
    ? [
        createDocumentDraft("nationalId", {
          key: "romanian-national-id",
          required: true,
          slot: "identity",
        }),
        createDocumentDraft("driverLicense", {
          key: "romanian-driver-license",
          required: false,
          slot: "driverLicense",
        }),
      ]
    : [
        createDocumentDraft("passport", {
          key: "foreign-identity",
          required: true,
          slot: "identity",
        }),
        createDocumentDraft("driverLicense", {
          key: "foreign-driver-license",
          required: false,
          slot: "driverLicense",
        }),
      ];
}

export function createDocumentDraft(
  type: v1.persons.PersonDocumentType,
  options: {
    key: string;
    required: boolean;
    slot: CreatePersonDocumentFormState["slot"];
  },
): CreatePersonDocumentFormState {
  return {
    key: options.key,
    required: options.required,
    slot: options.slot,
    type,
    series: "",
    number: "",
    cnp: "",
    issuingCountryCode: "RO",
    issuedBy: "",
    issuedOn: emptyDateParts(),
    expiresOn: emptyDateParts(),
    status: "verified",
    photos: {},
    notes: "",
  };
}

export function isBlankOptionalDocument(
  document: CreatePersonDocumentFormState,
) {
  return (
    !hasSelectedDocumentPhoto(document) &&
    document.series.trim().length === 0 &&
    document.number.trim().length === 0 &&
    document.cnp.trim().length === 0 &&
    document.issuedBy.trim().length === 0 &&
    document.notes.trim().length === 0 &&
    !hasDateParts(document.issuedOn) &&
    !hasDateParts(document.expiresOn)
  );
}

export function hasSelectedDocumentPhoto(
  document: CreatePersonDocumentFormState,
): boolean {
  return v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.some((slot) =>
    Boolean(document.photos[slot]),
  );
}

export function isUnder18Person(form: CreatePersonFormState): boolean {
  const dateOfBirth =
    form.citizenship === "romanian"
      ? v1.persons.getDateOfBirthFromCnp(
          form.documents.find((document) => document.type === "nationalId")
            ?.cnp,
        )
      : buildDateOnly(form.dateOfBirth).value;

  return v1.persons.isUnder18FromDateOfBirth(dateOfBirth);
}
