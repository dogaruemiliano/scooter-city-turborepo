import { v1 } from "@repo/api-shared";

import type { PersonDocumentFormFieldKey, PersonFormFieldKey } from "./types";

export const ROMANIAN_COUNTIES = v1.persons.ROMANIAN_COUNTIES;

export const FOREIGN_IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "residencePermit",
  "other",
] as const satisfies readonly v1.persons.PersonDocumentType[];

export const DOCUMENT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export const PERSON_FORM_FIELD_KEYS = new Set<PersonFormFieldKey>([
  "email",
  "phone",
  "firstName",
  "lastName",
  "cnp",
  "dateOfBirth",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "countryCode",
  "documents",
  "notes",
]);

export const PERSON_DOCUMENT_FORM_FIELD_KEYS =
  new Set<PersonDocumentFormFieldKey>([
    "type",
    "series",
    "number",
    "cnp",
    "issuingCountryCode",
    "hasExpiryDate",
    "expiresOn",
    "status",
    "licenseCategories",
    "photos",
    "notes",
  ]);
