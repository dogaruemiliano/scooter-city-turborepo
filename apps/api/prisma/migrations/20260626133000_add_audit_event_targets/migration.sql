ALTER TABLE "AuditEvent"
ADD COLUMN "targetType" TEXT,
ADD COLUMN "targetId" TEXT;

CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx"
ON "AuditEvent"("targetType", "targetId", "createdAt");
