-- CreateTable
CREATE TABLE "ContractSettings" (
    "companyId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "activeSetId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceAssetId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "validation" JSONB,
    "manifestHash" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewStatement" TEXT,
    "createdBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPreview" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "ContractPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSetVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "agreementVersionId" TEXT NOT NULL,
    "gdprVersionId" TEXT NOT NULL,
    "technicalVersionId" TEXT NOT NULL,
    "promotionVersionId" TEXT,
    "promotionApproved" BOOLEAN NOT NULL DEFAULT false,
    "manifestHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "rentalRevision" INTEGER NOT NULL,
    "inspectionId" TEXT,
    "templateSetVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshot" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "manifestHash" TEXT,
    "manifest" JSONB,
    "error" TEXT,
    "renderLeaseUntil" TIMESTAMP(3),
    "identityStatus" TEXT NOT NULL DEFAULT 'pending',
    "selfieAssetId" TEXT,
    "identityDocumentId" TEXT,
    "identityReviewedBy" TEXT,
    "identityReviewReason" TEXT,
    "identityApprovedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "customerCompletedAt" TIMESTAMP(3),
    "companyAcceptedAt" TIMESTAMP(3),
    "contractConcludedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalDocument" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "presentedAssetId" TEXT NOT NULL,
    "signedAssetId" TEXT,
    "signedHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "signedAt" TIMESTAMP(3),
    "requiresLimiterSignature" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RentalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningInvitation" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalSigningSession" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "finalVerifiedAt" TIMESTAMP(3),
    "otpHash" TEXT,
    "otpPurpose" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpSentAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSends" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalSigningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSignature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "signerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "acceptanceText" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDelivery" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCommand" (
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractCommand_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ContractTemplate_companyId_locale_type_idx" ON "ContractTemplate"("companyId", "locale", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplateVersion_templateId_version_key" ON "ContractTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractPreview_versionId_manifestHash_scenario_key" ON "ContractPreview"("versionId", "manifestHash", "scenario");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateSetVersion_companyId_locale_version_key" ON "TemplateSetVersion"("companyId", "locale", "version");

-- CreateIndex
CREATE INDEX "DocumentPackage_rentalId_status_idx" ON "DocumentPackage"("rentalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPackage_rentalId_revision_key" ON "DocumentPackage"("rentalId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "RentalDocument_packageId_type_key" ON "RentalDocument"("packageId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SigningInvitation_tokenHash_key" ON "SigningInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RentalSigningSession_tokenHash_key" ON "RentalSigningSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RentalSigningSession_expiresAt_revokedAt_idx" ON "RentalSigningSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSignature_documentId_role_key" ON "DocumentSignature"("documentId", "role");

-- CreateIndex
CREATE INDEX "ContractDelivery_status_nextRunAt_leaseUntil_idx" ON "ContractDelivery"("status", "nextRunAt", "leaseUntil");

-- AddForeignKey
ALTER TABLE "ContractSettings" ADD CONSTRAINT "ContractSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSettings" ADD CONSTRAINT "ContractSettings_activeSetId_fkey" FOREIGN KEY ("activeSetId") REFERENCES "TemplateSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPreview" ADD CONSTRAINT "ContractPreview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPreview" ADD CONSTRAINT "ContractPreview_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSetVersion" ADD CONSTRAINT "TemplateSetVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSetVersion" ADD CONSTRAINT "TemplateSetVersion_agreementVersionId_fkey" FOREIGN KEY ("agreementVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSetVersion" ADD CONSTRAINT "TemplateSetVersion_gdprVersionId_fkey" FOREIGN KEY ("gdprVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSetVersion" ADD CONSTRAINT "TemplateSetVersion_technicalVersionId_fkey" FOREIGN KEY ("technicalVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSetVersion" ADD CONSTRAINT "TemplateSetVersion_promotionVersionId_fkey" FOREIGN KEY ("promotionVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPackage" ADD CONSTRAINT "DocumentPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "FinanceLegalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPackage" ADD CONSTRAINT "DocumentPackage_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPackage" ADD CONSTRAINT "DocumentPackage_templateSetVersionId_fkey" FOREIGN KEY ("templateSetVersionId") REFERENCES "TemplateSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPackage" ADD CONSTRAINT "DocumentPackage_selfieAssetId_fkey" FOREIGN KEY ("selfieAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalDocument" ADD CONSTRAINT "RentalDocument_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DocumentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalDocument" ADD CONSTRAINT "RentalDocument_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalDocument" ADD CONSTRAINT "RentalDocument_presentedAssetId_fkey" FOREIGN KEY ("presentedAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalDocument" ADD CONSTRAINT "RentalDocument_signedAssetId_fkey" FOREIGN KEY ("signedAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningInvitation" ADD CONSTRAINT "SigningInvitation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DocumentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalSigningSession" ADD CONSTRAINT "RentalSigningSession_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DocumentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RentalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RentalSigningSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDelivery" ADD CONSTRAINT "ContractDelivery_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DocumentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Sequence values are deliberately never recycled after cancellation or rollback.
CREATE SEQUENCE "ContractNumberSequence" START WITH 1;

