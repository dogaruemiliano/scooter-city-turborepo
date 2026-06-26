/**
 * Persons-domain Zod schemas.
 *
 * `Person` is an admin-managed business record for rental flows. It is
 * separate from the authenticated `User` account shape; future account
 * linking can use the required unique email.
 */
import { z } from "zod";

import {
  countryCodeSchema,
  dateOnlySchema,
  normalizedEmailSchema,
  normalizedPhoneSchema,
  nullableTrimmedStringSchema,
  optionalSearchStringSchema,
  queryBooleanSchema,
  requiredTrimmedStringSchema,
} from "../common/common.schemas";
import {
  isPersonIdentityDocumentType,
  PERSON_DOCUMENT_EXPIRIES,
  PERSON_DRIVER_LICENSE_DOCUMENT_TYPE,
  PERSON_DOCUMENT_STATUSES,
  PERSON_DOCUMENT_TYPES,
  PERSON_LIST_SORTS,
  PERSON_RECORD_STATUSES,
} from "./persons.constants";

const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;
const MAX_PAGE_SIZE = 100;

const personNameSchema = requiredTrimmedStringSchema(MAX_NAME_LENGTH);
const nullableTrimmedTextSchema = nullableTrimmedStringSchema(MAX_TEXT_LENGTH);
const notesSchema = nullableTrimmedStringSchema(MAX_NOTES_LENGTH);
const CNP_WEIGHTS = "279146358279";
const cnpSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine(isValidCnp, {
    message: "CNP must be valid.",
  });

export const personDocumentTypeSchema = z.enum(PERSON_DOCUMENT_TYPES);
export const personDocumentStatusSchema = z.enum(PERSON_DOCUMENT_STATUSES);
export const personRecordStatusSchema = z.enum(PERSON_RECORD_STATUSES);
export const personDocumentExpirySchema = z.enum(PERSON_DOCUMENT_EXPIRIES);
export const personListSortSchema = z.enum(PERSON_LIST_SORTS);

export const personDocumentSchema = z
  .object({
    id: z.string(),
    personId: z.string(),
    type: personDocumentTypeSchema,
    series: z.string().nullable(),
    number: z.string().nullable(),
    cnp: z.string().nullable(),
    issuingCountryCode: z.string().nullable(),
    issuedBy: z.string().nullable(),
    issuedOn: z.string().nullable(),
    expiresOn: z.string().nullable(),
    status: personDocumentStatusSchema,
    notes: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of document creation."),
    updatedAt: z.string().describe("ISO timestamp of last document update."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "PersonDocument" });

export type PersonDocument = z.infer<typeof personDocumentSchema>;

export const personDocumentListSchema = z
  .array(personDocumentSchema)
  .meta({ id: "PersonDocumentList" });

export type PersonDocumentList = z.infer<typeof personDocumentListSchema>;

export const personSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    phone: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    postalCode: z.string().nullable(),
    countryCode: z.string().nullable(),
    documents: z.array(personDocumentSchema),
    notes: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of person creation."),
    updatedAt: z.string().describe("ISO timestamp of last person update."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "Person" });

export type Person = z.infer<typeof personSchema>;

export const createPersonDocumentInputSchema = z
  .object({
    type: personDocumentTypeSchema,
    series: nullableTrimmedTextSchema.optional(),
    number: nullableTrimmedTextSchema.optional(),
    cnp: cnpSchema.nullable().optional(),
    issuingCountryCode: countryCodeSchema.nullable().optional(),
    issuedBy: nullableTrimmedTextSchema.optional(),
    issuedOn: dateOnlySchema.nullable().optional(),
    expiresOn: dateOnlySchema.nullable().optional(),
    status: personDocumentStatusSchema.default("unverified"),
    notes: notesSchema.optional(),
  })
  .strict()
  .meta({ id: "CreatePersonDocumentInput" });

export type CreatePersonDocumentInput = z.infer<
  typeof createPersonDocumentInputSchema
>;

export const updatePersonDocumentInputSchema = z
  .object({
    type: personDocumentTypeSchema.optional(),
    series: nullableTrimmedTextSchema.optional(),
    number: nullableTrimmedTextSchema.optional(),
    cnp: cnpSchema.nullable().optional(),
    issuingCountryCode: countryCodeSchema.nullable().optional(),
    issuedBy: nullableTrimmedTextSchema.optional(),
    issuedOn: dateOnlySchema.nullable().optional(),
    expiresOn: dateOnlySchema.nullable().optional(),
    status: personDocumentStatusSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .meta({ id: "UpdatePersonDocumentInput" });

export type UpdatePersonDocumentInput = z.infer<
  typeof updatePersonDocumentInputSchema
>;

export const createPersonInputSchema = z
  .object({
    email: normalizedEmailSchema,
    phone: normalizedPhoneSchema,
    firstName: personNameSchema,
    lastName: personNameSchema,
    dateOfBirth: dateOnlySchema.nullable().optional(),
    addressLine1: nullableTrimmedTextSchema.optional(),
    addressLine2: nullableTrimmedTextSchema.optional(),
    city: nullableTrimmedTextSchema.optional(),
    region: nullableTrimmedTextSchema.optional(),
    postalCode: nullableTrimmedTextSchema.optional(),
    countryCode: countryCodeSchema.nullable().optional(),
    documents: z
      .array(createPersonDocumentInputSchema)
      .refine(hasUniqueDocumentTypes, {
        message: "Document types must be unique.",
      })
      .refine(hasAllowedDocumentSlots, {
        message:
          "Only one identity document and one driver license are allowed.",
      })
      .optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .meta({ id: "CreatePersonInput" });

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

export const updatePersonInputSchema = z
  .object({
    email: normalizedEmailSchema.optional(),
    phone: normalizedPhoneSchema.optional(),
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    dateOfBirth: dateOnlySchema.nullable().optional(),
    addressLine1: nullableTrimmedTextSchema.optional(),
    addressLine2: nullableTrimmedTextSchema.optional(),
    city: nullableTrimmedTextSchema.optional(),
    region: nullableTrimmedTextSchema.optional(),
    postalCode: nullableTrimmedTextSchema.optional(),
    countryCode: countryCodeSchema.nullable().optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .meta({ id: "UpdatePersonInput" });

export type UpdatePersonInput = z.infer<typeof updatePersonInputSchema>;

export const listPersonsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    search: optionalSearchStringSchema(MAX_TEXT_LENGTH),
    recordStatus: personRecordStatusSchema.optional(),
    documentType: personDocumentTypeSchema.optional(),
    documentStatus: personDocumentStatusSchema.optional(),
    documentExpiry: personDocumentExpirySchema.optional(),
    documentExpiresFrom: dateOnlySchema.optional(),
    documentExpiresTo: dateOnlySchema.optional(),
    countryCode: countryCodeSchema.optional(),
    documentIssuingCountryCode: countryCodeSchema.optional(),
    sort: personListSortSchema.optional(),
    includeDeleted: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListPersonsQuery" });

export type ListPersonsQuery = z.infer<typeof listPersonsQuerySchema>;

export const personListSchema = z
  .object({
    items: z.array(personSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "PersonList" });

export type PersonList = z.infer<typeof personListSchema>;

function hasUniqueDocumentTypes(
  documents: Array<{ type: z.infer<typeof personDocumentTypeSchema> }>,
): boolean {
  return (
    new Set(documents.map((document) => document.type)).size ===
    documents.length
  );
}

function hasAllowedDocumentSlots(
  documents: Array<{ type: z.infer<typeof personDocumentTypeSchema> }>,
): boolean {
  const identityCount = documents.filter((document) =>
    isPersonIdentityDocumentType(document.type),
  ).length;
  const driverLicenseCount = documents.filter(
    (document) => document.type === PERSON_DRIVER_LICENSE_DOCUMENT_TYPE,
  ).length;

  return identityCount <= 1 && driverLicenseCount <= 1;
}

export function isValidCnp(value?: string | null): boolean {
  if (!value) return false;

  const cnp = value.replace(/\s+/g, "");
  if (!/^\d{13}$/.test(cnp)) return false;

  const S = Number(cnp[0]);
  const YY = Number(cnp.slice(1, 3));
  const MM = Number(cnp.slice(3, 5));
  const DD = Number(cnp.slice(5, 7));
  const JJ = Number(cnp.slice(7, 9));
  const NNN = Number(cnp.slice(9, 12));
  const C = Number(cnp[12]);

  if (S < 1 || S > 9) return false;
  if (MM < 1 || MM > 12) return false;
  if (DD < 1 || DD > 31) return false;

  const century =
    S === 1 || S === 2
      ? 1900
      : S === 3 || S === 4
        ? 1800
        : S === 5 || S === 6
          ? 2000
          : S === 7 || S === 8
            ? 2000
            : 1900;
  const year = century + YY;
  const date = new Date(year, MM - 1, DD);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== MM - 1 ||
    date.getDate() !== DD
  ) {
    return false;
  }

  const isCountyValid = (JJ >= 1 && JJ <= 52) || JJ === 99;
  if (!isCountyValid) return false;
  if (NNN === 0) return false;

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(cnp.charAt(i)) * Number(CNP_WEIGHTS.charAt(i));
  }
  const remainder = sum % 11;
  const control = remainder === 10 ? 1 : remainder;

  return control === C;
}
