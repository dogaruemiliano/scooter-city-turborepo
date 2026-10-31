import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { toDateOnlyDate, toDateOnlyString } from "../common/dates/date-only";

/** Called after locking the scooter and saving its documents in the same transaction. */
export async function writeScooterItpValidity(
  tx: Prisma.TransactionClient,
  scooterId: string,
  requested: string | null | undefined,
  documentsChanged = false,
  civMetadataChanged = false,
) {
  if (requested === undefined && !documentsChanged && !civMetadataChanged)
    return;
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
  // Re-extraction may recover the CIV date for a scooter created before ITP
  // metadata existed. Reconcile only a lone date-only manual entry that agrees
  // with that initial validity, preserving every actual inspection/history.
  if (
    requested === undefined &&
    (documentsChanged || civMetadataChanged) &&
    latest?.source === "manual" &&
    latest.result === "unknown" &&
    latest.validUntil &&
    !latest.inspectionDate &&
    !latest.cardDocumentId &&
    !latest.certificateDocumentId &&
    !conflicts &&
    !newest
  ) {
    const scooter = await tx.scooter.findUniqueOrThrow({
      where: { id: scooterId },
      select: { civDocument: { select: { issuedAt: true } } },
    });
    const issuedAt = toDateOnlyString(scooter.civDocument?.issuedAt ?? null);
    if (
      issuedAt &&
      v1.scooters.initialScooterItpExpiry(issuedAt) ===
        toDateOnlyString(latest.validUntil) &&
      (await tx.scooterItpInspection.count({ where: { scooterId } })) === 1
    )
      requested = toDateOnlyString(latest.validUntil);
  }
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
  // The editor asks for confirmed validity, not an appointment or an OCR result.
  // Unreadable document results remain unknown until reviewed.
  const result =
    evidence?.result ??
    (validUntil && latest?.result !== "failed" && newest?.result !== "failed"
      ? "passed"
      : "unknown");
  if (
    latest &&
    toDateOnlyString(latest.validUntil) === validUntil &&
    latest.result === result &&
    (latest.source === source || !documentsChanged)
  )
    return;
  await tx.scooterItpInspection.create({
    data: {
      scooterId,
      source,
      validUntil: toDateOnlyDate(validUntil),
      result,
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
