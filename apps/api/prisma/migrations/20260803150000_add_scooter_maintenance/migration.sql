-- CreateEnum
CREATE TYPE "ScooterIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScooterIssueStatus" AS ENUM ('OPEN', 'FIXED');

-- AlterTable
ALTER TABLE "Scooter" ADD COLUMN "currentMileageKm" INTEGER;

-- Prisma does not represent CHECK constraints in schema.prisma. Keep these
-- database invariants in the checked-in migration.
ALTER TABLE "Scooter"
  ADD CONSTRAINT "Scooter_currentMileageKm_nonnegative_check"
  CHECK ("currentMileageKm" IS NULL OR "currentMileageKm" >= 0);

-- CreateTable
CREATE TABLE "ScooterIssue" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "ScooterIssueSeverity" NOT NULL,
    "status" "ScooterIssueStatus" NOT NULL DEFAULT 'OPEN',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "reportedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceType_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceType_intervalKm_positive_check"
      CHECK ("intervalKm" IS NULL OR "intervalKm" > 0),
    CONSTRAINT "MaintenanceType_intervalMonths_positive_check"
      CHECK ("intervalMonths" IS NULL OR "intervalMonths" > 0)
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "scooterId" TEXT NOT NULL,
    "maintenanceTypeId" TEXT NOT NULL,
    "performedAt" DATE NOT NULL,
    "performedKm" INTEGER NOT NULL,
    "notes" TEXT,
    "nextDueKm" INTEGER,
    "nextDueAt" DATE,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceRecord_performedKm_nonnegative_check"
      CHECK ("performedKm" >= 0),
    CONSTRAINT "MaintenanceRecord_nextDueKm_nonnegative_check"
      CHECK ("nextDueKm" IS NULL OR "nextDueKm" >= 0)
);

-- CreateIndex
CREATE INDEX "ScooterIssue_scooterId_status_severity_reportedAt_idx" ON "ScooterIssue"("scooterId", "status", "severity" DESC, "reportedAt" DESC);

-- CreateIndex
CREATE INDEX "ScooterIssue_status_reportedAt_idx" ON "ScooterIssue"("status", "reportedAt" DESC);

-- CreateIndex
CREATE INDEX "ScooterIssue_severity_reportedAt_idx" ON "ScooterIssue"("severity", "reportedAt" DESC);

-- CreateIndex
CREATE INDEX "ScooterIssue_reportedAt_idx" ON "ScooterIssue"("reportedAt" DESC);

-- CreateIndex
CREATE INDEX "ScooterIssue_reportedByUserId_idx" ON "ScooterIssue"("reportedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceType_code_key" ON "MaintenanceType"("code");

-- CreateIndex
CREATE INDEX "MaintenanceType_isActive_name_idx" ON "MaintenanceType"("isActive", "name");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_scooterId_maintenanceTypeId_performedAt_c_idx" ON "MaintenanceRecord"("scooterId", "maintenanceTypeId", "performedAt" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MaintenanceRecord_scooterId_performedAt_createdAt_idx" ON "MaintenanceRecord"("scooterId", "performedAt" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MaintenanceRecord_maintenanceTypeId_performedAt_idx" ON "MaintenanceRecord"("maintenanceTypeId", "performedAt" DESC);

-- CreateIndex
CREATE INDEX "MaintenanceRecord_nextDueAt_idx" ON "MaintenanceRecord"("nextDueAt");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_recordedByUserId_idx" ON "MaintenanceRecord"("recordedByUserId");

-- AddForeignKey
ALTER TABLE "ScooterIssue" ADD CONSTRAINT "ScooterIssue_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterIssue" ADD CONSTRAINT "ScooterIssue_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_scooterId_fkey" FOREIGN KEY ("scooterId") REFERENCES "Scooter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_maintenanceTypeId_fkey" FOREIGN KEY ("maintenanceTypeId") REFERENCES "MaintenanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
