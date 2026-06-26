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

export const PERSON_DRIVER_LICENSE_DOCUMENT_TYPE = "driverLicense" as const;

export const PERSON_IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "nationalId",
  "residencePermit",
  "other",
] as const satisfies readonly PersonDocumentType[];

export type PersonIdentityDocumentType =
  (typeof PERSON_IDENTITY_DOCUMENT_TYPES)[number];

export function isPersonIdentityDocumentType(
  type: PersonDocumentType,
): type is PersonIdentityDocumentType {
  return (PERSON_IDENTITY_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export const PERSON_DOCUMENT_STATUSES = [
  "unverified",
  "verified",
  "rejected",
  "expired",
] as const;

export type PersonDocumentStatus = (typeof PERSON_DOCUMENT_STATUSES)[number];

export const PERSON_RECORD_STATUSES = ["active", "deleted", "all"] as const;

export type PersonRecordStatus = (typeof PERSON_RECORD_STATUSES)[number];

export const PERSON_DOCUMENT_EXPIRIES = [
  "expired",
  "expiresSoon",
  "valid",
  "missing",
] as const;

export type PersonDocumentExpiry = (typeof PERSON_DOCUMENT_EXPIRIES)[number];

export const PERSON_LIST_SORTS = [
  "relevance",
  "nameAsc",
  "nameDesc",
  "createdAtDesc",
  "createdAtAsc",
  "updatedAtDesc",
  "updatedAtAsc",
  "emailAsc",
  "emailDesc",
] as const;

export type PersonListSort = (typeof PERSON_LIST_SORTS)[number];

export const ROUTES = {
  list: "/v1/persons",
  create: "/v1/persons",
  get: (id: string): string => `/v1/persons/${id}`,
  update: (id: string): string => `/v1/persons/${id}`,
  delete: (id: string): string => `/v1/persons/${id}`,
  documents: {
    list: (personId: string): string => `/v1/persons/${personId}/documents`,
    create: (personId: string): string => `/v1/persons/${personId}/documents`,
    get: (personId: string, documentId: string): string =>
      `/v1/persons/${personId}/documents/${documentId}`,
    update: (personId: string, documentId: string): string =>
      `/v1/persons/${personId}/documents/${documentId}`,
    delete: (personId: string, documentId: string): string =>
      `/v1/persons/${personId}/documents/${documentId}`,
  },
} as const;
