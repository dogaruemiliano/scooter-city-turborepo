ALTER TABLE "PersonDocument"
  ADD COLUMN "nationalIdFormat" TEXT,
  ADD COLUMN "licenseCategories" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "PersonDocument"
  ADD CONSTRAINT "person_document_national_id_format_check"
    CHECK ("nationalIdFormat" IS NULL OR ("type" = 'nationalId' AND "nationalIdFormat" IN ('classic', 'electronic'))),
  ADD CONSTRAINT "person_document_license_categories_check"
    CHECK (jsonb_typeof("licenseCategories") = 'array' AND ("type" = 'driverLicense' OR "licenseCategories" = '[]'::jsonb));

DROP INDEX "person_document_active_identity_unique";
CREATE UNIQUE INDEX "person_document_active_identity_unique"
  ON "PersonDocument" ("personId")
  WHERE "deletedAt" IS NULL AND "type" IN ('passport', 'nationalId', 'other');
