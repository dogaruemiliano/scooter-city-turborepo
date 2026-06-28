import { v1 } from "@repo/api-shared";

import type { PersonDocumentFormFieldKey, PersonFormFieldKey } from "./types";

export const ROMANIAN_COUNTIES = [
  "Alba",
  "Arad",
  "Argeș",
  "Bacău",
  "Bihor",
  "Bistrița-Năsăud",
  "Botoșani",
  "Brașov",
  "Brăila",
  "București",
  "Buzău",
  "Caraș-Severin",
  "Călărași",
  "Cluj",
  "Constanța",
  "Covasna",
  "Dâmbovița",
  "Dolj",
  "Galați",
  "Giurgiu",
  "Gorj",
  "Harghita",
  "Hunedoara",
  "Ialomița",
  "Iași",
  "Ilfov",
  "Maramureș",
  "Mehedinți",
  "Mureș",
  "Neamț",
  "Olt",
  "Prahova",
  "Satu Mare",
  "Sălaj",
  "Sibiu",
  "Suceava",
  "Teleorman",
  "Timiș",
  "Tulcea",
  "Vaslui",
  "Vâlcea",
  "Vrancea",
] as const;

export const FOREIGN_IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "residencePermit",
  "other",
] as const satisfies readonly v1.persons.PersonDocumentType[];

export const PERSON_FORM_FIELD_KEYS = new Set<PersonFormFieldKey>([
  "email",
  "phone",
  "firstName",
  "lastName",
  "dateOfBirth",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
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
    "issuedBy",
    "issuedOn",
    "expiresOn",
    "status",
    "notes",
  ]);
