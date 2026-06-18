CREATE TABLE "OtpDeliveryQuota" (
    "bucket" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpDeliveryQuota_pkey"
    PRIMARY KEY ("bucket", "subjectHash", "windowStart")
);

CREATE INDEX "OtpDeliveryQuota_windowEnd_idx"
ON "OtpDeliveryQuota"("windowEnd");
