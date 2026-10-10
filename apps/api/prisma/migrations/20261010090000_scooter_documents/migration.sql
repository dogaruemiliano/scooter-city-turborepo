-- CreateEnum
CREATE TYPE "ScooterDocumentType" AS ENUM ('civ', 'registration_certificate');

-- CreateTable
CREATE TABLE "ScooterDocument" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "type" "ScooterDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScooterDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScooterDocument_assetId_key" ON "ScooterDocument"("assetId");

-- CreateIndex
CREATE INDEX "ScooterDocument_scooterId_type_deletedAt_idx" ON "ScooterDocument"("scooterId", "type", "deletedAt");

-- AddForeignKey
ALTER TABLE "ScooterDocument" ADD CONSTRAINT "ScooterDocument_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterDocument" ADD CONSTRAINT "ScooterDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
