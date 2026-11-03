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
  const readings = v1.scooters.scooterItpEvidence(documents);
  const current = v1.scooters.latestScooterItpEvidence(readings);
  const newest = current.find((row) => row.validUntil) ?? current[0];
  const conflicts = v1.scooters.scooterItpEvidenceConflicts(current);
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
  const evidence = conflicts
    ? undefined
    : current.find((row) => row.validUntil === validUntil);
  // An explicit correction can supply an unreadable expiry without destroying
  // the AI reading. Keep links to the unambiguous inspection and both originals.
  const reviewed =
    evidence ??
    (requested !== undefined && current.length === 1 ? current[0] : undefined);
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
  let result =
    (evidence ? (evidence.result ?? "unknown") : undefined) ??
    (validUntil &&
    latest?.result !== "failed" &&
    !current.some((row) => row.result === "failed")
      ? "passed"
      : "unknown");
  if (
    result === "passed" &&
    latest?.result === "failed" &&
    (!evidence?.inspectionDate ||
      !latest.inspectionDate ||
      evidence.inspectionDate <= toDateOnlyString(latest.inspectionDate)!)
  )
    result = "unknown";
  if (
    latest &&
    toDateOnlyString(latest.validUntil) === validUntil &&
    latest.result === result &&
    (latest.source === source || !documentsChanged) &&
    (!documentsChanged ||
      ((latest.cardDocumentId ?? null) ===
        (reviewed?.sources.find((item) => item.type === "itp_card")
          ?.documentId ?? null) &&
        (latest.certificateDocumentId ?? null) ===
          (reviewed?.sources.find((item) => item.type === "itp_certificate")
            ?.documentId ?? null)))
  )
    return;
  await tx.scooterItpInspection.create({
    data: {
      scooterId,
      source,
      validUntil: toDateOnlyDate(validUntil),
      result,
      inspectionDate: toDateOnlyDate(reviewed?.inspectionDate ?? null),
      effectiveDate: toDateOnlyDate(v1.common.dateOnlyToday())!,
      cardDocumentId:
        reviewed?.sources.find((source) => source.type === "itp_card")
          ?.documentId ?? null,
      certificateDocumentId:
        reviewed?.sources.find((source) => source.type === "itp_certificate")
          ?.documentId ?? null,
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
