import type { v1 } from "@repo/api-shared";
import type { useTranslations } from "next-intl";

export interface PersonDetailPageProps {
  person: v1.persons.Person;
  auditEvents: v1.persons.PersonAuditEvent[];
  documentPhotos: DocumentPhotosByDocumentId;
  personsHref: string;
}

export interface Feedback {
  kind: "error" | "success";
  title: string;
  messages: string[];
}

export type PersonsTranslations = ReturnType<typeof useTranslations>;

export type ReadinessIssue =
  | "missingIdentity"
  | "missingDriverLicense"
  | "hasRejected"
  | "hasExpired"
  | "hasUnverified";

export type DocumentPhotosByDocumentId = Record<
  string,
  v1.persons.PersonDocumentPhoto[]
>;

export interface PersonFormState {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  notes: string;
}

export interface DocumentFormState {
  type: v1.persons.PersonDocumentType;
  series: string;
  number: string;
  cnp: string;
  issuingCountryCode: string;
  issuedBy: string;
  issuedOn: string;
  expiresOn: string;
  status: v1.persons.PersonDocumentStatus;
  notes: string;
}
