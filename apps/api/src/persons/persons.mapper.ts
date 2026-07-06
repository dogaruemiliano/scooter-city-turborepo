import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type {
  MediaAsset as MediaAssetRow,
  Person as PersonRow,
  PersonDocument as PersonDocumentRow,
  PersonDocumentPhoto as PersonDocumentPhotoRow,
} from "../generated/prisma/client";

export type PersonWithDocuments = PersonRow & {
  documents: PersonDocumentRow[];
};

export type PersonDocumentPhotoWithAsset = PersonDocumentPhotoRow & {
  asset: MediaAssetRow;
};

export function toPerson(row: PersonWithDocuments): v1.persons.Person {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: toDateOnlyString(row.dateOfBirth),
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    documents: row.documents.map(toPersonDocument),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function toPersonDocument(
  row: PersonDocumentRow,
): v1.persons.PersonDocument {
  return {
    id: row.id,
    personId: row.personId,
    type: row.type as v1.persons.PersonDocument["type"],
    series: row.series,
    number: row.number,
    cnp: row.cnp,
    issuingCountryCode: row.issuingCountryCode,
    issuedBy: row.issuedBy,
    issuedOn: toDateOnlyString(row.issuedOn),
    expiresOn: toDateOnlyString(row.expiresOn),
    status: row.status as v1.persons.PersonDocument["status"],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function toPersonDocumentPhoto(
  row: PersonDocumentPhotoWithAsset,
  personId: string,
): v1.persons.PersonDocumentPhoto {
  const slot = row.slot as v1.persons.PersonDocumentPhotoSlot;

  return {
    id: row.id,
    personDocumentId: row.personDocumentId,
    slot,
    assetId: row.assetId,
    contentType: row.asset.contentType,
    byteSize: row.asset.byteSize,
    checksumSha256: row.asset.checksumSha256,
    contentUrl: v1.persons.ROUTES.documents.photos.content(
      personId,
      row.personDocumentId,
      slot,
    ),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
