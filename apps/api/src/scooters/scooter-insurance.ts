import { BadRequestException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { toDateOnlyDate } from "../common/dates/date-only";

/** Called after locking the scooter through its create/update, in the same transaction. */
export async function writeInsurancePolicies(
  tx: Prisma.TransactionClient,
  scooterId: string,
  vin: string,
  policies: v1.scooters.InsurancePolicyInput[] = [],
) {
  for (const policy of policies) {
    const existing = await tx.scooterInsurancePolicy.findUnique({
      where: { id: policy.id },
    });
    if (existing && existing.scooterId !== scooterId)
      throw new BadRequestException(
        "Insurance policy does not belong to this scooter",
      );
    const { id, validFrom, validUntil, rawFields, ...fields } = policy;
    const data = {
      ...fields,
      validFrom: toDateOnlyDate(validFrom),
      validUntil: toDateOnlyDate(validUntil),
      rawFields,
    };
    if (existing)
      await tx.scooterInsurancePolicy.update({
        where: { id, scooterId },
        data,
      });
    else
      await tx.scooterInsurancePolicy.create({
        data: { ...data, id, scooterId },
      });
  }
  // Also guard VIN changes against policies omitted from this PATCH.
  const mismatch = await tx.scooterInsurancePolicy.findFirst({
    where: { scooterId, documentVin: { not: vin } },
    select: { id: true },
  });
  if (mismatch)
    throw new BadRequestException({
      message: "Insurance VIN does not match scooter VIN",
      code: "INSURANCE_VIN_MISMATCH",
      details: { field: "vin" },
    });
}
