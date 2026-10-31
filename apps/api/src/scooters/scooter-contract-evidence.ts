import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** Referenced vehicle client copies belong to retained contractual evidence, not ordinary removal. */
export async function assertVehicleDocumentsMutable(
  tx: Prisma.TransactionClient,
  scooterId: string,
  documentIds: readonly string[],
): Promise<void> {
  if (!documentIds.length) return;
  // Package creation and document edits use this same parent lock before pinning any references.
  await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${scooterId} FOR UPDATE`;
  const reference = await tx.documentPackage.findFirst({
    where: {
      rental: { scooterId },
      OR: documentIds.map((documentId) => ({
        snapshot: {
          path: ["vehicleDocuments"],
          array_contains: [{ documentId }],
        },
      })),
    },
    select: { id: true },
  });
  if (reference)
    throw new ConflictException({
      code: "VEHICLE_CONTRACT_EVIDENCE_PRESERVED",
      message:
        "This vehicle document is referenced by a retained contract package. Add renewal documents while preserving the original client copy.",
    });
}
