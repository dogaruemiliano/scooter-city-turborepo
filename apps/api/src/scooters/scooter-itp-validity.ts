import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";

/** Called after locking the scooter and saving its documents in the same transaction. */
export async function writeScooterItpValidity(
  tx: Prisma.TransactionClient,
  scooterId: string,
  requested: string | null | undefined,
  documentsChanged = false,
) {
  if (requested === undefined && !documentsChanged) return;
  const latest = await tx.scooterItpInspection.findFirst({
    where: { scooterId },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const documents = await tx.scooterDocument.findMany({
    where: { scooterId, deletedAt: null, asset: { deletedAt: null } },
    select: { id: true, type: true, extractedData: true },
  });
  const readings = documents
    .flatMap((document) => {
      const parsed = v1.scooters.scooterDocumentExtractedDataSchema.safeParse(
        document.extractedData,
      );
      if (!parsed.success) return [];
      return (parsed.data.documents ?? [])
        .filter(
          (entry) =>
            entry.documentType === "itp_card" ||
            entry.documentType === "itp_certificate",
        )
        .flatMap((entry) =>
          (entry.inspections ?? [])
            .filter(
              (row) =>
                !row.inspectionDate ||
                row.inspectionDate <= v1.common.dateOnlyToday(),
            )
            .map((row) => ({
              ...row,
              documentId: document.id,
              type: entry.documentType,
            })),
        );
    })
    .sort((a, b) =>
      (b.inspectionDate ?? "").localeCompare(a.inspectionDate ?? ""),
    );
  const newest = readings[0];
  const current = readings.filter(
    (row) => row.inspectionDate === newest?.inspectionDate,
  );
  const conflicts = current.some(
    (row) =>
      row.validUntil !== newest?.validUntil || row.result !== newest?.result,
  );
  if (requested === null && !latest && documentsChanged) requested = undefined;
  // Automatic extraction fills missing information; reviewed/manual values need an explicit edit.
  if (requested === undefined && (latest || conflicts || !newest)) return;
  const validUntil = requested === undefined ? newest.validUntil : requested;
  const evidence = current.find((row) => row.validUntil === validUntil);
  if (!latest && !validUntil && evidence?.result !== "failed") return;
  if (!latest && !evidence && validUntil) {
    const row = await tx.scooter.findUniqueOrThrow({
      where: { id: scooterId },
      select: { civDocument: { select: { issuedAt: true } } },
    });
    const issuedAt = toDateOnlyString(row.civDocument?.issuedAt ?? null);
    if (
      issuedAt &&
      v1.scooters.initialScooterItpExpiry(issuedAt) === validUntil
    )
      return;
  }
  const source = evidence ? "document" : "manual";
  if (
    latest &&
    toDateOnlyString(latest.validUntil) === validUntil &&
    (latest.source === source || !documentsChanged)
  )
    return;
  await tx.scooterItpInspection.create({
    data: {
      scooterId,
      source,
      validUntil: toDateOnlyDate(validUntil),
      result: evidence?.result ?? "unknown",
      inspectionDate: toDateOnlyDate(evidence?.inspectionDate ?? null),
      effectiveDate: toDateOnlyDate(v1.common.dateOnlyToday())!,
      cardDocumentId:
        evidence?.type === "itp_card" ? evidence.documentId : null,
      certificateDocumentId:
        evidence?.type === "itp_certificate" ? evidence.documentId : null,
    },
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
