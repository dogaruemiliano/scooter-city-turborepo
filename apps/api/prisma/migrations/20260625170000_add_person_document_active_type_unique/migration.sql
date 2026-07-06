CREATE UNIQUE INDEX "person_document_active_type_unique"
ON "PersonDocument"("personId", "type")
WHERE "deletedAt" IS NULL;
