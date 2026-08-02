CREATE TYPE "CompanyLegalForm" AS ENUM (
  'SRL',
  'SA',
  'PFA',
  'II',
  'IF',
  'ONG',
  'OTHER'
);

ALTER TABLE "Company"
ADD COLUMN "legalForm" "CompanyLegalForm" NOT NULL DEFAULT 'SRL';
