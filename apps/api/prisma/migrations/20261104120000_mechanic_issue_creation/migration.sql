BEGIN;

-- Add creation to existing mechanic roles without replacing explicit restrictions.
DO $migration$
DECLARE
  target_role RECORD;
  added_count INTEGER;
BEGIN
  FOR target_role IN
    SELECT id FROM "Role" WHERE slug = 'mechanic' AND "archivedAt" IS NULL FOR UPDATE
  LOOP
    INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
    VALUES (target_role.id, 'problems.create', ARRAY['ALL']::"PermissionScope"[])
    ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
    GET DIAGNOSTICS added_count = ROW_COUNT;
    IF added_count > 0 THEN
      UPDATE "Role" SET revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = target_role.id;
      UPDATE "User" SET "accessRevision" = "accessRevision" + 1
      WHERE id IN (SELECT "userId" FROM "UserRole" WHERE "roleId" = target_role.id);
      INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
      VALUES ('migration-20261104120000-mechanic-create-' || target_role.id,
        'ACCESS_ROLE_CHANGED', 'Role', target_role.id,
        jsonb_build_object('source', '20261104120000_mechanic_issue_creation',
          'actor', 'system', 'addedPermission', 'problems.create'))
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END
$migration$;

-- Cooldown queries only inspect the recent reminder outbox, across all tasks.
CREATE INDEX "NotificationEvent_reminder_createdAt_idx" ON "NotificationEvent" ("createdAt")
WHERE type IN ('issue.reminder', 'todo.reminder');

COMMIT;
