import type { v1 } from "@repo/api-shared";

import type {
  BusinessLegalEntity,
  Company,
  Counterparty,
} from "../generated/prisma/client";

type CompanyWithCounterparty = Company & {
  counterparty: Pick<Counterparty, "id"> | null;
  businessLegalEntity: Pick<BusinessLegalEntity, "id"> | null;
};

export function toCompany(row: CompanyWithCounterparty): v1.finance.Company {
  if (!row.counterparty) {
    throw new Error(`Company ${row.id} has no counterparty`);
  }

  return {
    id: row.id,
    counterpartyId: row.counterparty.id,
    businessLegalEntityId: row.businessLegalEntity?.id ?? null,
    legalName: row.legalName,
    legalForm: row.legalForm,
    tradingName: row.tradingName,
    taxIdentifier: row.taxIdentifier,
    registrationNumber: row.registrationNumber,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
