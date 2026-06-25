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
  PERSON_DOCUMENT_STATUSES,
  PERSON_DOCUMENT_TYPES,
} from "./persons.constants";

const MAX_NAME_LENGTH = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;
const MAX_PAGE_SIZE = 100;

const personNameSchema = requiredTrimmedStringSchema(MAX_NAME_LENGTH);
const nullableTrimmedTextSchema = nullableTrimmedStringSchema(MAX_TEXT_LENGTH);
const notesSchema = nullableTrimmedStringSchema(MAX_NOTES_LENGTH);

export const personDocumentTypeSchema = z.enum(PERSON_DOCUMENT_TYPES);
export const personDocumentStatusSchema = z.enum(PERSON_DOCUMENT_STATUSES);

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
    documentType: personDocumentTypeSchema.nullable(),
    documentNumber: z.string().nullable(),
    documentIssuingCountryCode: z.string().nullable(),
    documentExpiresOn: z.string().nullable(),
    documentStatus: personDocumentStatusSchema,
    notes: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of person creation."),
    updatedAt: z.string().describe("ISO timestamp of last person update."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "Person" });

export type Person = z.infer<typeof personSchema>;

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
    documentType: personDocumentTypeSchema.nullable().optional(),
    documentNumber: nullableTrimmedTextSchema.optional(),
    documentIssuingCountryCode: countryCodeSchema.nullable().optional(),
    documentExpiresOn: dateOnlySchema.nullable().optional(),
    documentStatus: personDocumentStatusSchema.default("unverified"),
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
    documentType: personDocumentTypeSchema.nullable().optional(),
    documentNumber: nullableTrimmedTextSchema.optional(),
    documentIssuingCountryCode: countryCodeSchema.nullable().optional(),
    documentExpiresOn: dateOnlySchema.nullable().optional(),
    documentStatus: personDocumentStatusSchema.optional(),
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
