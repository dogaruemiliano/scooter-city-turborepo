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
  PERSON_AUDIT_EVENT_TYPES,
  isPersonIdentityDocumentType,
  PERSON_DOCUMENT_EXPIRIES,
  PERSON_DRIVER_LICENSE_DOCUMENT_TYPE,
  PERSON_DOCUMENT_PHOTO_SLOTS,
  PERSON_DOCUMENT_STATUSES,
  PERSON_DOCUMENT_TYPES,
  PERSON_LIST_SORTS,
  PERSON_RECORD_STATUSES,
} from "./persons.constants";

const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;
const MAX_PAGE_SIZE = 100;
const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

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
export const personDocumentPhotoSlotSchema = z.enum(
  PERSON_DOCUMENT_PHOTO_SLOTS,
);
export const personDocumentPhotoContentTypeSchema = z.enum(IMAGE_CONTENT_TYPES);
export const personAuditEventTypeSchema = z.enum(PERSON_AUDIT_EVENT_TYPES);
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

export const personDocumentPhotoSchema = z
  .object({
    id: z.string(),
    personDocumentId: z.string(),
    slot: personDocumentPhotoSlotSchema,
    assetId: z.string(),
    contentType: z.string(),
    byteSize: z.number().int().nonnegative(),
    checksumSha256: z.string(),
    contentUrl: z.string(),
    createdAt: z.string().describe("ISO timestamp of photo creation."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "PersonDocumentPhoto" });

export type PersonDocumentPhoto = z.infer<typeof personDocumentPhotoSchema>;

export const personDocumentPhotoListSchema = z
  .array(personDocumentPhotoSchema)
  .meta({ id: "PersonDocumentPhotoList" });

export type PersonDocumentPhotoList = z.infer<
  typeof personDocumentPhotoListSchema
>;

export const createPersonDocumentPhotoUploadUrlInputSchema = z
  .object({
    contentType: personDocumentPhotoContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(SHA_256_HEX_PATTERN),
  })
  .strict()
  .meta({ id: "CreatePersonDocumentPhotoUploadUrlInput" });

export type CreatePersonDocumentPhotoUploadUrlInput = z.infer<
  typeof createPersonDocumentPhotoUploadUrlInputSchema
>;

export const personDocumentPhotoUploadUrlSchema = z
  .object({
    uploadUrl: z.string().url(),
    uploadToken: z.string().min(1),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z
      .string()
      .describe("ISO timestamp when the signed URL expires."),
    maxBytes: z.number().int().positive(),
  })
  .meta({ id: "PersonDocumentPhotoUploadUrl" });

export type PersonDocumentPhotoUploadUrl = z.infer<
  typeof personDocumentPhotoUploadUrlSchema
>;

export const completePersonDocumentPhotoUploadInputSchema = z
  .object({
    uploadToken: z.string().min(1),
  })
  .strict()
  .meta({ id: "CompletePersonDocumentPhotoUploadInput" });

export type CompletePersonDocumentPhotoUploadInput = z.infer<
  typeof completePersonDocumentPhotoUploadInputSchema
>;

export const personAuditActorSchema = z
  .object({
    kind: z.enum(["user", "system"]),
    userId: z.string().nullable(),
    email: z.string().nullable(),
    name: z.string().nullable(),
  })
  .meta({ id: "PersonAuditActor" });

export type PersonAuditActor = z.infer<typeof personAuditActorSchema>;

export const personAuditFieldChangeSchema = z
  .object({
    field: z.string(),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
  })
  .meta({ id: "PersonAuditFieldChange" });

export type PersonAuditFieldChange = z.infer<
  typeof personAuditFieldChangeSchema
>;

export const personAuditDocumentSummarySchema = z
  .object({
    id: z.string(),
    type: personDocumentTypeSchema,
    status: personDocumentStatusSchema,
  })
  .meta({ id: "PersonAuditDocumentSummary" });

export type PersonAuditDocumentSummary = z.infer<
  typeof personAuditDocumentSummarySchema
>;

export const personAuditReplacementSchema = z
  .object({
    oldDocument: personAuditDocumentSummarySchema,
    newDocument: personAuditDocumentSummarySchema,
  })
  .meta({ id: "PersonAuditReplacement" });

export type PersonAuditReplacement = z.infer<
  typeof personAuditReplacementSchema
>;

export const personAuditEventSchema = z
  .object({
    id: z.string(),
    type: personAuditEventTypeSchema,
    personId: z.string(),
    actor: personAuditActorSchema,
    document: personAuditDocumentSummarySchema.nullable(),
    replacement: personAuditReplacementSchema.nullable(),
    changes: z.array(personAuditFieldChangeSchema),
    createdAt: z.string().describe("ISO timestamp of audit event creation."),
  })
  .meta({ id: "PersonAuditEvent" });

export type PersonAuditEvent = z.infer<typeof personAuditEventSchema>;

export const personAuditEventListSchema = z
  .array(personAuditEventSchema)
  .meta({ id: "PersonAuditEventList" });

export type PersonAuditEventList = z.infer<typeof personAuditEventListSchema>;

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
    status: personDocumentStatusSchema.default("verified"),
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
  return getDateOfBirthFromCnp(value) !== null;
}

export function isUnder18FromCnp(
  value?: string | null,
  referenceDate = new Date(),
): boolean {
  const dateOfBirth = getDateOfBirthFromCnp(value);
  return isUnder18FromDateOfBirth(dateOfBirth, referenceDate);
}

export function isUnder18FromDateOfBirth(
  value?: string | null,
  referenceDate = new Date(),
): boolean {
  const dateOfBirth = parseDateOnly(value);
  if (!dateOfBirth) return false;

  const eighteenthBirthday = Date.UTC(
    dateOfBirth.year + 18,
    dateOfBirth.month - 1,
    dateOfBirth.day,
  );
  const referenceDay = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  return referenceDay < eighteenthBirthday;
}

export function getDateOfBirthFromCnp(value?: string | null): string | null {
  if (!value) return null;

  const cnp = value.replace(/\s+/g, "");
  if (!/^\d{13}$/.test(cnp)) return null;

  const S = Number(cnp[0]);
  const YY = Number(cnp.slice(1, 3));
  const MM = Number(cnp.slice(3, 5));
  const DD = Number(cnp.slice(5, 7));
  const JJ = Number(cnp.slice(7, 9));
  const NNN = Number(cnp.slice(9, 12));

  if (S < 1 || S > 9) return null;
  if (MM < 1 || MM > 12) return null;
  if (DD < 1 || DD > 31) return null;

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
  const date = new Date(Date.UTC(year, MM - 1, DD));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== MM - 1 ||
    date.getUTCDate() !== DD
  ) {
    return null;
  }

  const isCountyValid = (JJ >= 1 && JJ <= 52) || JJ === 99;
  if (!isCountyValid) return null;
  if (NNN === 0) return null;
  if (!hasValidCnpChecksum(cnp)) return null;

  return date.toISOString().slice(0, 10);
}

function parseDateOnly(
  value?: string | null,
): { year: number; month: number; day: number } | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function hasValidCnpChecksum(value?: string | null): boolean {
  if (!value) return false;

  const cnp = value.replace(/\s+/g, "");
  if (!/^\d{13}$/.test(cnp)) return false;

  const C = Number(cnp[12]);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(cnp.charAt(i)) * Number(CNP_WEIGHTS.charAt(i));
  }
  const remainder = sum % 11;
  const control = remainder === 10 ? 1 : remainder;

  return control === C;
}
