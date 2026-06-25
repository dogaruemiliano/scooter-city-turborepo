/**
 * Persons-domain shared constants and route helpers.
 */

export const PERSON_DOCUMENT_TYPES = [
  "passport",
  "nationalId",
  "driverLicense",
  "residencePermit",
  "other",
] as const;

export type PersonDocumentType = (typeof PERSON_DOCUMENT_TYPES)[number];

export const PERSON_DOCUMENT_STATUSES = [
  "unverified",
  "verified",
  "rejected",
  "expired",
] as const;

export type PersonDocumentStatus = (typeof PERSON_DOCUMENT_STATUSES)[number];

export const ROUTES = {
  list: "/v1/persons",
  create: "/v1/persons",
  get: (id: string): string => `/v1/persons/${id}`,
  update: (id: string): string => `/v1/persons/${id}`,
  delete: (id: string): string => `/v1/persons/${id}`,
} as const;
