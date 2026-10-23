BEGIN;
SELECT pg_advisory_xact_lock(726001);
DO $migration$
DECLARE
  target_role TEXT;
  before_grants JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditEvent" WHERE id = 'migration-20261023010000-delegation') THEN RETURN; END IF;
  SELECT id INTO target_role FROM "Role" WHERE slug = 'admin' AND "archivedAt" IS NULL FOR UPDATE;
  IF target_role IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."permissionKey"), '[]'::jsonb)
    INTO before_grants FROM "RolePermission" p WHERE p."roleId" = target_role;
    INSERT INTO "RolePermission" ("roleId", "permissionKey", "scopes")
    SELECT target_role, permission.key, ARRAY['ALL']::"PermissionScope"[]
    FROM (VALUES ('users.read'), ('users.invite'), ('users.roles.update'),
      ('users.permissions.update'), ('roles.read')) AS permission(key)
    ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
    UPDATE "Role" SET revision = revision + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = target_role;
    UPDATE "User" SET "accessRevision" = "accessRevision" + 1
    WHERE id IN (SELECT "userId" FROM "UserRole" WHERE "roleId" = target_role);
  END IF;
  INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
  VALUES ('migration-20261023010000-delegation', 'ACCESS_ROLE_CHANGED', 'Role', target_role,
    jsonb_build_object('source', '20261023010000_delegated_access_management', 'actor', 'system',
      'before', before_grants,
      'after', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."permissionKey"), '[]'::jsonb)
        FROM "RolePermission" p WHERE p."roleId" = target_role)));
END
$migration$;
COMMIT;
