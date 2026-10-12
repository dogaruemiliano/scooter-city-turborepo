-- AlterTable
ALTER TABLE "DraftUpload" ADD COLUMN     "cleanedAt" TIMESTAMP(3),
ADD COLUMN     "editorSessionId" TEXT,
ADD COLUMN     "processingUntil" TIMESTAMP(3),
ADD COLUMN     "uploadUrlExpiresAt" TIMESTAMP(3),
ADD COLUMN     "writeSafeAfter" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ScooterDocumentEditorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "scooterId" TEXT,
    "saveFingerprint" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterDocumentEditorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScooterDocumentJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentType" "ScooterDocumentType" NOT NULL,
    "draftUploadId" TEXT,
    "documentId" TEXT,
    "scooterId" TEXT,
    "sourceFingerprint" TEXT NOT NULL,
    "requestBinding" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "validatedSource" JSONB,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerResponseId" TEXT,
    "submissionUncertainAt" TIMESTAMP(3),
    "cancellationAt" TIMESTAMP(3),
    "result" JSONB,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterDocumentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScooterDocumentResource" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "sessionId" TEXT,
    "jobId" TEXT,
    "draftUploadId" TEXT,
    "kind" TEXT NOT NULL,
    "bucket" TEXT,
    "storageKey" TEXT,
    "providerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "lastPossibleWriteAt" TIMESTAMP(3) NOT NULL,
    "cleanupAfter" TIMESTAMP(3) NOT NULL,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterDocumentResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScooterDocumentProviderEvent" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScooterDocumentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScooterDocumentReconciliationCursor" (
    "id" TEXT NOT NULL,
    "continuationToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScooterDocumentReconciliationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScooterDocumentEditorSession_status_expiresAt_idx" ON "ScooterDocumentEditorSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ScooterDocumentEditorSession_userId_createdAt_idx" ON "ScooterDocumentEditorSession"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterDocumentJob_providerResponseId_key" ON "ScooterDocumentJob"("providerResponseId");

-- CreateIndex
CREATE INDEX "ScooterDocumentJob_status_nextRunAt_leaseUntil_idx" ON "ScooterDocumentJob"("status", "nextRunAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "ScooterDocumentJob_sessionId_status_idx" ON "ScooterDocumentJob"("sessionId", "status");

-- CreateIndex
CREATE INDEX "ScooterDocumentJob_draftUploadId_idx" ON "ScooterDocumentJob"("draftUploadId");

-- CreateIndex
CREATE INDEX "ScooterDocumentJob_expiresAt_idx" ON "ScooterDocumentJob"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterDocumentJob_userId_attemptId_key" ON "ScooterDocumentJob"("userId", "attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ScooterDocumentResource_identity_key" ON "ScooterDocumentResource"("identity");

-- CreateIndex
CREATE INDEX "ScooterDocumentResource_status_cleanupAfter_leaseUntil_idx" ON "ScooterDocumentResource"("status", "cleanupAfter", "leaseUntil");

-- CreateIndex
CREATE INDEX "ScooterDocumentResource_sessionId_idx" ON "ScooterDocumentResource"("sessionId");

-- CreateIndex
CREATE INDEX "ScooterDocumentResource_jobId_idx" ON "ScooterDocumentResource"("jobId");

-- CreateIndex
CREATE INDEX "ScooterDocumentResource_draftUploadId_idx" ON "ScooterDocumentResource"("draftUploadId");

-- CreateIndex
CREATE INDEX "ScooterDocumentProviderEvent_processedAt_nextRunAt_leaseUnt_idx" ON "ScooterDocumentProviderEvent"("processedAt", "nextRunAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "DraftUpload_editorSessionId_claimedAt_cleanedAt_idx" ON "DraftUpload"("editorSessionId", "claimedAt", "cleanedAt");

-- AddForeignKey
ALTER TABLE "DraftUpload" ADD CONSTRAINT "DraftUpload_editorSessionId_fkey" FOREIGN KEY ("editorSessionId") REFERENCES "ScooterDocumentEditorSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterDocumentJob" ADD CONSTRAINT "ScooterDocumentJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScooterDocumentEditorSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterDocumentResource" ADD CONSTRAINT "ScooterDocumentResource_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScooterDocumentEditorSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScooterDocumentResource" ADD CONSTRAINT "ScooterDocumentResource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScooterDocumentJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
