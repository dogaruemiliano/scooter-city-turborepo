import { BadRequestException, ConflictException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type {
  Prisma,
  ScooterInsurancePolicy,
} from "../generated/prisma/client";
import { toDateOnlyString, toDateOnlyDate } from "../common/dates/date-only";

export function insurancePolicyResponse(
  policy: ScooterInsurancePolicy,
): v1.scooters.InsurancePolicy {
  return {
    id: policy.id,
    insuredName: policy.insuredName,
    validFrom: toDateOnlyString(policy.validFrom),
    validUntil: toDateOnlyString(policy.validUntil),
    premiumAmount:
      policy.premiumAmount == null ? null : Number(policy.premiumAmount),
    currency: policy.currency,
    documentVin: policy.documentVin,
    vinReviewConfirmed: policy.vinReviewConfirmed,
    rawFields: v1.scooters.insuranceRawFieldsSchema.parse(
      policy.rawFields ?? {},
    ),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

async function dateSourceFromDocuments(
  tx: Prisma.TransactionClient,
  scooterId: string,
  policyId: string,
  vin: string,
  validFrom: string | null,
  validUntil: string | null,
): Promise<"manual" | "document"> {
  const documents = await tx.scooterDocument.findMany({
    where: {
      scooterId,
      insurancePolicyId: policyId,
      deletedAt: null,
      asset: { deletedAt: null },
    },
    select: { type: true, extractedData: true },
  });
  const matches = documents.some((doc) => {
    const parsed = v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
      doc.extractedData,
    );
    if (!parsed.success) return false;
    const entries: Pick<
      v1.scooters.ScooterDocumentExtractedData,
      "vin" | "fields"
    >[] = parsed.data.documents?.length
      ? parsed.data.documents.filter(
          (entry) => entry.documentType === "insurance",
        )
      : doc.type === "insurance"
        ? [parsed.data]
        : [];
    return entries.some(
      (entry) =>
        (!entry.vin || entry.vin === vin) &&
        entry.fields.validFrom === validFrom &&
        entry.fields.validUntil === validUntil,
    );
  });
  return matches ? "document" : "manual";
}

type PendingDateSource = {
  id: string;
  policyId: string;
  validFrom: string | null;
  validUntil: string | null;
};

/** Resolve newly recorded dates after document associations/extractions have committed inside this transaction. */
export async function resolveInsuranceDateSources(
  tx: Prisma.TransactionClient,
  scooterId: string,
  vin: string,
  pending: PendingDateSource[],
) {
  for (const revision of pending)
    await tx.scooterInsuranceRevision.update({
      where: { id: revision.id },
      data: {
        source: await dateSourceFromDocuments(
          tx,
          scooterId,
          revision.policyId,
          vin,
          revision.validFrom,
          revision.validUntil,
        ),
      },
    });
}

/** Called after locking the scooter through its create/update, in the same transaction. */
export async function writeInsurancePolicies(
  tx: Prisma.TransactionClient,
  scooterId: string,
  vin: string,
  policies: v1.scooters.InsurancePolicyInput[] = [],
  source: "manual" | "document" | "unknown" = "unknown",
) {
  const pending: PendingDateSource[] = [];
  for (const policy of policies) {
    const existing = await tx.scooterInsurancePolicy.findUnique({
      where: { id: policy.id },
    });
    if (existing && (existing.scooterId !== scooterId || existing.deletedAt))
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
    const prior = existing
      ? await tx.scooterInsuranceRevision.findFirst({
          where: { policyId: id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : null;
    if (existing) {
      // Baseline snapshots preserve policies created before revision tracking.
      if (!prior)
        await tx.scooterInsuranceRevision.create({
          data: {
            policyId: id,
            snapshot: insurancePolicyResponse(existing),
            source: "unknown",
            createdAt: existing.updatedAt,
          },
        });
    }
    const saved = existing
      ? await tx.scooterInsurancePolicy.update({
          where: { id, scooterId },
          data,
        })
      : await tx.scooterInsurancePolicy.create({
          data: { ...data, id, scooterId },
        });
    let dateSource: "manual" | "document" | "unknown" = source;
    const datesChanged =
      !existing ||
      toDateOnlyString(existing.validFrom) !== validFrom ||
      toDateOnlyString(existing.validUntil) !== validUntil;
    if (!datesChanged && source !== "document")
      dateSource = v1.scooters.insuranceRevisionSchema.shape.source.parse(
        prior?.source ?? "unknown",
      );
    else if (source === "document") {
      dateSource = await dateSourceFromDocuments(
        tx,
        scooterId,
        id,
        vin,
        validFrom,
        validUntil,
      );
    }
    const snapshot = insurancePolicyResponse(saved);
    const before = existing && insurancePolicyResponse(existing);
    const changedFields = [
      "insuredName",
      "validFrom",
      "validUntil",
      "premiumAmount",
      "currency",
      "documentVin",
      "vinReviewConfirmed",
      "rawFields",
    ] as const;
    if (
      !before ||
      changedFields.some(
        (field) =>
          JSON.stringify(before[field]) !== JSON.stringify(snapshot[field]),
      ) ||
      (source === "document" && dateSource !== prior?.source)
    ) {
      const revision = await tx.scooterInsuranceRevision.create({
        data: {
          policyId: id,
          source: dateSource,
          snapshot: snapshot,
        },
      });
      if (source === "unknown" && datesChanged && revision?.id)
        pending.push({ id: revision.id, policyId: id, validFrom, validUntil });
    }
  }
  // Also guard VIN changes against policies omitted from this PATCH.
  const mismatch = await tx.scooterInsurancePolicy.findFirst({
    where: { scooterId, deletedAt: null, documentVin: { not: vin } },
    select: { id: true },
  });
  if (mismatch)
    throw new BadRequestException({
      message: "Insurance VIN does not match scooter VIN",
      code: "INSURANCE_VIN_MISMATCH",
      details: { field: "vin" },
    });
  return pending;
}

/** Policy removal is staged and committed with the parent scooter save. */
export async function removeInsurancePolicies(
  tx: Prisma.TransactionClient,
  scooterId: string,
  ids: string[] = [],
) {
  if (!ids.length) return;
  const policies = await tx.scooterInsurancePolicy.findMany({
    where: { id: { in: ids }, scooterId, deletedAt: null },
  });
  if (policies.length !== ids.length)
    throw new BadRequestException(
      "Insurance policy does not belong to this scooter",
    );
  const count = await tx.scooterInsurancePolicy.count({
    where: { scooterId, deletedAt: null },
  });
  if (count - policies.length < 1)
    throw new ConflictException({
      code: "INSURANCE_LAST_POLICY",
      message: "The last insurance policy cannot be deleted.",
    });
  for (const policy of policies) {
    const previous = await tx.scooterInsuranceRevision.findFirst({
      where: { policyId: policy.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    await tx.scooterInsuranceRevision.create({
      data: {
        policyId: policy.id,
        action: "deleted",
        source: previous?.source ?? "unknown",
        snapshot: insurancePolicyResponse(policy),
      },
    });
  }
  await tx.scooterInsurancePolicy.updateMany({
    where: { id: { in: ids }, scooterId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  const scooter = await tx.scooter.findUniqueOrThrow({
    where: { id: scooterId },
    select: { updatedAt: true },
  });
  await tx.scooter.update({
    where: { id: scooterId },
    data: {
      updatedAt: new Date(
        Math.max(Date.now(), scooter.updatedAt.getTime() + 1),
      ),
    },
  });
}
