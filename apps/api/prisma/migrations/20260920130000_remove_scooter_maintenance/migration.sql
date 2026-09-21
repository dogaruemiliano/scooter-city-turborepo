-- DropForeignKey
ALTER TABLE "ScooterIssue" DROP CONSTRAINT "ScooterIssue_scooterId_fkey";

-- DropForeignKey
ALTER TABLE "ScooterIssue" DROP CONSTRAINT "ScooterIssue_reportedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRecord" DROP CONSTRAINT "MaintenanceRecord_scooterId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRecord" DROP CONSTRAINT "MaintenanceRecord_maintenanceTypeId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRecord" DROP CONSTRAINT "MaintenanceRecord_recordedByUserId_fkey";

-- DropTable
DROP TABLE "ScooterIssue";

-- DropTable
DROP TABLE "MaintenanceType";

-- DropTable
DROP TABLE "MaintenanceRecord";

-- DropEnum
DROP TYPE "ScooterIssueSeverity";

-- DropEnum
DROP TYPE "ScooterIssueStatus";
