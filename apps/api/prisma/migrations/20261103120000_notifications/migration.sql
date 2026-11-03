BEGIN;

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "targetPath" TEXT,
    "scooter" JSONB,
    "changes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminRecipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedRecipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removedRecipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "problemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'activity',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "presentedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationEvent_processedAt_availableAt_leaseUntil_idx" ON "NotificationEvent"("processedAt", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_id_idx" ON "NotificationEvent"("createdAt", "id");

-- CreateIndex
CREATE INDEX "NotificationEvent_category_createdAt_id_idx" ON "NotificationEvent"("category", "createdAt", "id");

-- CreateIndex
CREATE INDEX "NotificationEvent_permissionKey_createdAt_idx" ON "NotificationEvent"("permissionKey", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_problemId_idx" ON "NotificationEvent"("problemId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_presentedAt_idx" ON "Notification"("recipientId", "readAt", "presentedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_recipientId_key" ON "Notification"("eventId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPushSubscription_endpointHash_key" ON "NotificationPushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "NotificationPushSubscription_userId_revokedAt_idx" ON "NotificationPushSubscription"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "NotificationPushSubscription_sessionId_idx" ON "NotificationPushSubscription"("sessionId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_availableAt_leaseUntil_idx" ON "NotificationDelivery"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_subscriptionId_key" ON "NotificationDelivery"("notificationId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "ScooterProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushSubscription" ADD CONSTRAINT "NotificationPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPushSubscription" ADD CONSTRAINT "NotificationPushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Explicit defaults for the new feature; existing grants and user overrides
-- are never overwritten. New installations receive the same defaults in seed.
SELECT pg_advisory_xact_lock(726001);
DO $migration$
DECLARE
  target_role RECORD;
  added_count INTEGER;
BEGIN
  FOR target_role IN
    SELECT id, slug FROM "Role"
    WHERE slug IN ('admin', 'mechanic') AND "archivedAt" IS NULL
    FOR UPDATE
  LOOP
    INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
    VALUES (target_role.id, 'notifications.receive',
      CASE WHEN target_role.slug = 'admin'
        THEN ARRAY['ALL']::"PermissionScope"[]
        ELSE ARRAY['ASSIGNED']::"PermissionScope"[] END)
    ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
    GET DIAGNOSTICS added_count = ROW_COUNT;
    IF target_role.slug = 'admin' THEN
      INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
      VALUES (target_role.id, 'notifications.activity.read', ARRAY['ALL']::"PermissionScope"[])
      ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
      added_count := added_count + FOUND::INTEGER;
    END IF;
    IF added_count > 0 THEN
      UPDATE "Role" SET revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = target_role.id;
      UPDATE "User" SET "accessRevision" = "accessRevision" + 1
      WHERE id IN (SELECT "userId" FROM "UserRole" WHERE "roleId" = target_role.id);
      INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
      VALUES ('migration-20261103120000-notifications-' || target_role.slug,
        'ACCESS_ROLE_CHANGED', 'Role', target_role.id,
        jsonb_build_object('source', '20261103120000_notifications',
          'actor', 'system', 'addedNotificationDefaults', true))
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
