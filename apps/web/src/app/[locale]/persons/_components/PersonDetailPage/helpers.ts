import { v1 } from "@repo/api-shared";
import { getCountryName } from "@repo/ui/lib/countries";

import type {
  DocumentFormState,
  DocumentPhotosByDocumentId,
  PersonFormState,
  PersonsTranslations,
  ReadinessIssue,
} from "./types";
import { isPersonDocumentExpired } from "../document-status";

export function getRentalReadiness(person: v1.persons.Person): {
  issues: ReadinessIssue[];
} {
  const documents = person.documents.filter((document) => !document.deletedAt);
  const issues: ReadinessIssue[] = [];

  if (
    !documents.some((document) =>
      v1.persons.isPersonIdentityDocumentType(document.type),
    )
  ) {
    issues.push("missingIdentity");
  }

  if (!documents.some((document) => document.type === "driverLicense")) {
    issues.push("missingDriverLicense");
  }

  if (documents.some((document) => document.status === "rejected")) {
    issues.push("hasRejected");
  }

  if (documents.some((document) => isPersonDocumentExpired(document))) {
    issues.push("hasExpired");
  }

  if (documents.some((document) => document.status === "unverified")) {
    issues.push("hasUnverified");
  }

  return { issues };
}

export function maskSensitiveValue(
  value: string | null,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  const visibleLength = Math.min(4, value.length);
  const hiddenLength = Math.max(4, value.length - visibleLength);

  return `${"*".repeat(hiddenLength)}${value.slice(-visibleLength)}`;
}

export function formatOptionalDate(
  value: string | null,
  locale: string,
  fallback: string,
): string {
  return value ? formatDate(value, locale) : fallback;
}

export function formatCountryName(
  countryCode: string | null,
  locale: string,
  fallback: string,
): string {
  return getCountryName(countryCode, locale) ?? fallback;
}

export function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function personFormState(person: v1.persons.Person): PersonFormState {
  return {
    email: person.email,
    phone: person.phone,
    firstName: person.firstName,
    lastName: person.lastName,
    dateOfBirth: person.dateOfBirth ?? "",
    addressLine1: person.addressLine1 ?? "",
    addressLine2: person.addressLine2 ?? "",
    city: person.city ?? "",
    region: person.region ?? "",
    postalCode: person.postalCode ?? "",
    countryCode: person.countryCode ?? "",
    notes: person.notes ?? "",
  };
}

export function documentFormState(
  document?: v1.persons.PersonDocument,
  initialType: v1.persons.PersonDocumentType = "nationalId",
): DocumentFormState {
  return {
    type: document?.type ?? initialType,
    series: document?.series ?? "",
    number: document?.number ?? "",
    cnp: document?.cnp ?? "",
    issuingCountryCode: document?.issuingCountryCode ?? "",
    issuedBy: document?.issuedBy ?? "",
    issuedOn: document?.issuedOn ?? "",
    hasExpiryDate: document ? document.expiresOn !== null : true,
    expiresOn: document?.expiresOn ?? "",
    status: document?.status ?? "verified",
    notes: document?.notes ?? "",
  };
}

export function documentFormInput(
  form: DocumentFormState,
): v1.persons.UpdatePersonDocumentInput {
  return {
    type: form.type,
    series: blankToNull(form.series),
    number: blankToNull(form.number),
    cnp: blankToNull(form.cnp),
    issuingCountryCode: blankToNull(form.issuingCountryCode),
    issuedBy: blankToNull(form.issuedBy),
    issuedOn: blankToNull(form.issuedOn),
    expiresOn: form.hasExpiryDate ? blankToNull(form.expiresOn) : null,
    status: form.status,
    notes: blankToNull(form.notes),
  };
}

export function documentFormHasChanges(
  form: DocumentFormState,
  document?: v1.persons.PersonDocument,
): boolean {
  if (!document) {
    return true;
  }

  const parsed = v1.persons.updatePersonDocumentInputSchema.safeParse(
    documentFormInput(form),
  );
  if (!parsed.success) {
    return true;
  }

  const input = parsed.data;
  return (
    input.type !== document.type ||
    input.series !== document.series ||
    input.number !== document.number ||
    input.cnp !== document.cnp ||
    input.issuingCountryCode !== document.issuingCountryCode ||
    input.issuedBy !== document.issuedBy ||
    input.issuedOn !== document.issuedOn ||
    input.expiresOn !== document.expiresOn ||
    input.status !== document.status ||
    input.notes !== document.notes
  );
}

export function upsertDocumentPhoto(
  current: DocumentPhotosByDocumentId,
  documentId: string,
  photo: v1.persons.PersonDocumentPhoto,
): DocumentPhotosByDocumentId {
  const photos = current[documentId] ?? [];
  return {
    ...current,
    [documentId]: sortDocumentPhotos([
      ...photos.filter((existing) => existing.slot !== photo.slot),
      photo,
    ]),
  };
}

export function removeDocumentPhoto(
  current: DocumentPhotosByDocumentId,
  documentId: string,
  slot: v1.persons.PersonDocumentPhotoSlot,
): DocumentPhotosByDocumentId {
  return {
    ...current,
    [documentId]: (current[documentId] ?? []).filter(
      (photo) => photo.slot !== slot,
    ),
  };
}

export function whatsappHrefForPhone(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function actorLabel(
  actor: v1.persons.PersonAuditActor,
  t: PersonsTranslations,
): string {
  if (actor.kind === "system") {
    return actor.name ?? t("detail.activity.systemActor");
  }

  return actor.name ?? actor.email ?? t("detail.activity.unknownActor");
}

export function formatAuditChange(
  change: v1.persons.PersonAuditFieldChange,
  t: PersonsTranslations,
): string {
  const field = auditFieldLabel(change.field, t);

  if (change.oldValue && change.newValue) {
    return t("detail.activity.changedFromTo", {
      field,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  }

  if (change.newValue) {
    return t("detail.activity.changedTo", {
      field,
      newValue: change.newValue,
    });
  }

  return t("detail.activity.cleared", { field });
}

function sortDocumentPhotos(
  photos: v1.persons.PersonDocumentPhoto[],
): v1.persons.PersonDocumentPhoto[] {
  const slotOrder = new Map(
    v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.map((slot, index) => [slot, index]),
  );
  return photos.toSorted(
    (first, second) =>
      (slotOrder.get(first.slot) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(second.slot) ?? Number.MAX_SAFE_INTEGER),
  );
}

function auditFieldLabel(field: string, t: PersonsTranslations): string {
  switch (field) {
    case "email":
      return t("fields.email");
    case "phone":
      return t("fields.phone");
    case "firstName":
      return t("fields.firstName");
    case "lastName":
      return t("fields.lastName");
    case "dateOfBirth":
      return t("fields.dateOfBirth");
    case "addressLine1":
      return t("fields.addressLine1");
    case "addressLine2":
      return t("fields.addressLine2");
    case "city":
      return t("fields.city");
    case "region":
      return t("fields.region");
    case "postalCode":
      return t("fields.postalCode");
    case "countryCode":
      return t("fields.countryCode");
    case "notes":
    case "document.notes":
      return t("fields.notes");
    case "document.type":
      return t("fields.documentType");
    case "document.series":
      return t("fields.documentSeries");
    case "document.number":
      return t("fields.documentNumber");
    case "document.cnp":
      return t("fields.documentCnp");
    case "document.issuingCountryCode":
      return t("fields.documentIssuingCountryCode");
    case "document.issuedBy":
      return t("fields.documentIssuedBy");
    case "document.issuedOn":
      return t("fields.documentIssuedOn");
    case "document.expiresOn":
      return t("fields.documentExpiresOn");
    case "document.status":
      return t("fields.documentStatus");
    default:
      return field;
  }
}
