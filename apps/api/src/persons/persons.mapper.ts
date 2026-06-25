import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../common/dates/date-only";
import type { Person as PersonRow } from "../generated/prisma/client";

export function toPerson(row: PersonRow): v1.persons.Person {
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
    documentType: row.documentType as v1.persons.Person["documentType"],
    documentNumber: row.documentNumber,
    documentIssuingCountryCode: row.documentIssuingCountryCode,
    documentExpiresOn: toDateOnlyString(row.documentExpiresOn),
    documentStatus: row.documentStatus as v1.persons.Person["documentStatus"],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
