import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** A referenced identity photograph is contractual evidence. Replace the document, never its bytes. */
export async function assertDocumentPhotosMutable(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "PersonDocument" WHERE id = ${documentId} FOR UPDATE`;
  const reference = await tx.documentPackage.findFirst({
    where: { identityDocumentId: documentId },
    select: { id: true },
  });
  if (reference)
    throw new ConflictException({
      code: "IDENTITY_EVIDENCE_PRESERVED",
      message:
        "This identity document is referenced by a contract package. Replace the identity document through a controlled revision; its original photographs must be preserved.",
    });
}
