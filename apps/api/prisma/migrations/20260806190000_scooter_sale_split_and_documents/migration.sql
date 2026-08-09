-- AlterTable
ALTER TABLE "ScooterSale" ADD COLUMN     "paidBusinessAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidPersonalAmount" DECIMAL(19,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScooterSaleDocument" (
    "id" TEXT NOT NULL,
    "scooterSaleId" TEXT NOT NULL,
    "assetId" TEXT,
    "documentNumber" TEXT,
    "issuedOn" DATE,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterSaleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScooterSaleDocument_scooterSaleId_key" ON "ScooterSaleDocument"("scooterSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterSaleDocument_assetId_key" ON "ScooterSaleDocument"("assetId");

-- AddForeignKey
ALTER TABLE "ScooterSaleDocument" ADD CONSTRAINT "ScooterSaleDocument_scooterSaleId_fkey" FOREIGN KEY ("scooterSaleId") REFERENCES "ScooterSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterSaleDocument" ADD CONSTRAINT "ScooterSaleDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterSaleDocument" ADD CONSTRAINT "ScooterSaleDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
