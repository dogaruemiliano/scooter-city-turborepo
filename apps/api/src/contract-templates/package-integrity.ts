import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";

/** Bind live source revisions, independently of mutable names and display formatting. */
export async function packageSourceFingerprint(
  tx: Prisma.TransactionClient,
  rentalId: string,
  identityDocumentId: string | null,
) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
    include: {
      person: true,
      scooter: true,
      participants: { include: { person: true } },
    },
  });
  if (!rental) throw new ConflictException("Rental unavailable");
  const identity = identityDocumentId
    ? await tx.personDocument.findFirst({
        where: {
          id: identityDocumentId,
          personId: rental.personId,
          deletedAt: null,
        },
        include: {
          photos: {
            where: { deletedAt: null },
            include: { asset: true },
            orderBy: { id: "asc" },
          },
        },
      })
    : null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        rental: rental.id,
        revision: rental.revision,
        person: rental.person.updatedAt.toISOString(),
        scooter: rental.scooter.updatedAt.toISOString(),
        identity: identity?.updatedAt.toISOString() ?? null,
        identityPhotos:
          identity?.photos.map((photo) => ({
            id: photo.id,
            assetId: photo.assetId,
            sha256: photo.asset.checksumSha256,
            deletedAt: photo.asset.deletedAt?.toISOString() ?? null,
          })) ?? [],
        participants: rental.participants
          .map((p) => `${p.personId}:${p.person.updatedAt.toISOString()}`)
          .sort(),
      }),
    )
    .digest("hex");
}

/** Editing source data never migrates a signing act onto new content. */
export async function assertPackageCurrent(
  tx: Prisma.TransactionClient,
  pkg: {
    rentalId: string;
    rentalRevision: number;
    sourceFingerprint: string;
    identityDocumentId: string | null;
  },
) {
  const source = await tx.rental.findUnique({
    where: { id: pkg.rentalId },
    select: { personId: true },
  });
  if (!source) throw new ConflictException("Rental unavailable");
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${source.personId} FOR SHARE`;
  if (pkg.identityDocumentId)
    await tx.$queryRaw`SELECT id FROM "PersonDocument" WHERE id = ${pkg.identityDocumentId} FOR SHARE`;
  await tx.$queryRaw`SELECT p.id FROM "Person" p JOIN "RentalParticipant" rp ON rp."personId" = p.id WHERE rp."rentalId" = ${pkg.rentalId} ORDER BY p.id FOR SHARE OF p`;
  if (
    (await packageSourceFingerprint(
      tx,
      pkg.rentalId,
      pkg.identityDocumentId,
    )) !== pkg.sourceFingerprint
  )
    throw new ConflictException({
      code: "CONTRACT_REVISION_REQUIRED",
      message:
        "Rental, identity or scooter data changed. Create a new document revision.",
    });
}
