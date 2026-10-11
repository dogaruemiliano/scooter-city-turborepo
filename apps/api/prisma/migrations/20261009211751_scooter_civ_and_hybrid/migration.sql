-- AlterEnum
ALTER TYPE "PowertrainType" ADD VALUE 'hybrid';

-- AlterTable
ALTER TABLE "Scooter" ADD COLUMN     "civNumber" TEXT,
ADD COLUMN     "nationalEmissionsCode" TEXT,
ADD COLUMN     "vehicleType" TEXT;
