CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Person_search_trgm_idx" ON "Person" USING gin (
  lower(
    coalesce("email", '') || ' ' ||
    coalesce("phone", '') || ' ' ||
    coalesce("firstName", '') || ' ' ||
    coalesce("lastName", '') || ' ' ||
    coalesce("addressLine1", '') || ' ' ||
    coalesce("addressLine2", '') || ' ' ||
    coalesce("city", '') || ' ' ||
    coalesce("region", '') || ' ' ||
    coalesce("postalCode", '') || ' ' ||
    coalesce("countryCode", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
);

CREATE INDEX "Person_countryCode_deletedAt_idx" ON "Person"("countryCode", "deletedAt");

CREATE INDEX "PersonDocument_search_trgm_idx" ON "PersonDocument" USING gin (
  lower(
    coalesce("type", '') || ' ' ||
    coalesce("series", '') || ' ' ||
    coalesce("number", '') || ' ' ||
    coalesce("cnp", '') || ' ' ||
    coalesce("issuingCountryCode", '') || ' ' ||
    coalesce("issuedBy", '') || ' ' ||
    coalesce("status", '') || ' ' ||
    coalesce("notes", '')
  ) gin_trgm_ops
) WHERE "deletedAt" IS NULL;

CREATE INDEX "PersonDocument_active_filters_idx" ON "PersonDocument"(
  "personId",
  "type",
  "status",
  "issuingCountryCode",
  "expiresOn"
) WHERE "deletedAt" IS NULL;
