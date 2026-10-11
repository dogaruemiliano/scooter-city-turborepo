-- Preserve access held before the roles/permissions cutover. This is a one-time
-- compatibility migration; User.roles is not consulted by runtime authorization.
-- Never restore an access decision made through the new authorization system.
BEGIN;

SELECT pg_advisory_xact_lock(726001);

DO $migration$
DECLARE
  cutover_at TIMESTAMP;
  candidate RECORD;
  legacy_role "Role"%ROWTYPE;
  becomes_super_admin BOOLEAN;
  assigned_role_ids TEXT[];
  migration_source CONSTANT TEXT := '20261011122000_migrate_legacy_access';
  -- Frozen at cutover: existing business features only. Future catalog entries
  -- must not expand the authority of migrated administrators.
  legacy_permissions CONSTANT TEXT[] := ARRAY[
    'persons.read',
    'persons.create',
    'persons.update',
    'persons.archive',
    'persons.audit.read',
    'person_documents.read',
    'person_documents.write',
    'person_documents.delete',
    'person_documents.extract',
    'scooters.read',
    'scooters.create',
    'scooters.update',
    'scooters.archive',
    'scooter_documents.read',
    'scooter_documents.write',
    'scooter_documents.extract',
    'scooter_brands.read',
    'scooter_brands.manage',
    'vehicle_civ.read',
    'finance.books.read',
    'finance.suppliers.read',
    'finance.accounts.read',
    'finance.operations.read',
    'finance.reference.read',
    'finance.suppliers.manage',
    'finance.expenses.create',
    'finance.funding.create',
    'finance.operations.reverse',
    'finance.settlements.preview'
  ];
BEGIN
  -- Empty databases (including migration shadow databases) need no backfill.
  -- Checking this first also avoids relying on migration metadata in shadows.
  IF NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."deletedAt" IS NULL
      AND u."accessRevision" = 1
      AND u."loginStatus" = 'DISABLED'
      AND NOT u."isSuperAdmin"
      AND u.roles && ARRAY['ADMIN', 'SUPER_ADMIN']::TEXT[]
      AND NOT EXISTS (SELECT 1 FROM "UserRole" ur WHERE ur."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "UserPermissionOverride" o WHERE o."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "UserInvitation" i WHERE i."userId" = u.id)
  ) THEN
    RETURN;
  END IF;

  IF to_regclass('"_prisma_migrations"') IS NULL THEN
    RAISE EXCEPTION 'Legacy access migration requires the recorded authorization cutover; no accounts were changed';
  END IF;

  -- Prisma stores application DateTimes without a time zone, in UTC. Convert
  -- its timestamptz migration marker explicitly, independently of session zone.
  SELECT MIN(started_at) AT TIME ZONE 'UTC'
  INTO cutover_at
  FROM "_prisma_migrations"
  WHERE migration_name = '20261011120000_user_access_and_roles'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;

  IF cutover_at IS NULL THEN
    RAISE EXCEPTION 'Legacy access migration requires a completed authorization cutover migration; no accounts were changed';
  END IF;

  FOR candidate IN
    SELECT u.id, u.roles, u."loginStatus", u."isSuperAdmin", u."accessRevision"
    FROM "User" u
    WHERE u."createdAt" < cutover_at
      AND u."deletedAt" IS NULL
      AND u."accessRevision" = 1
      AND u."loginStatus" = 'DISABLED'
      AND NOT u."isSuperAdmin"
      AND u.roles && ARRAY['ADMIN', 'SUPER_ADMIN']::TEXT[]
      AND NOT EXISTS (SELECT 1 FROM "UserRole" ur WHERE ur."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "UserPermissionOverride" o WHERE o."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "UserInvitation" i WHERE i."userId" = u.id)
    ORDER BY u.id
    FOR UPDATE OF u
  LOOP
    -- SUPER_ADMIN takes precedence when both legacy role strings are present.
    becomes_super_admin := COALESCE('SUPER_ADMIN' = ANY(candidate.roles), false);
    assigned_role_ids := ARRAY[]::TEXT[];

    IF NOT becomes_super_admin THEN
      IF legacy_role.id IS NULL THEN
        SELECT r.* INTO legacy_role
        FROM "Role" r
        WHERE r.slug = 'legacy-administrator'
        FOR UPDATE;

        IF NOT FOUND THEN
          INSERT INTO "Role" (id, slug, name, description, "updatedAt")
          VALUES (
            'migration-20261011122000-legacy-administrator',
            'legacy-administrator',
            'Legacy administrator',
            'Business access preserved from the pre-permissions ADMIN role.',
            CURRENT_TIMESTAMP
          )
          RETURNING * INTO legacy_role;

          INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
          SELECT legacy_role.id, permission_key, ARRAY['ALL']::"PermissionScope"[]
          FROM unnest(legacy_permissions) AS permission_key;

          INSERT INTO "AuditEvent" (id, "userId", type, "targetType", "targetId", meta)
          VALUES (
            'migration-20261011122000-legacy-role-created',
            NULL,
            'ACCESS_ROLE_CREATED',
            'Role',
            legacy_role.id,
            jsonb_build_object(
              'source', migration_source,
              'actor', 'system',
              'before', NULL,
              'after', jsonb_build_object(
                'id', legacy_role.id,
                'slug', legacy_role.slug,
                'name', legacy_role.name,
                'description', legacy_role.description,
                'revision', legacy_role.revision,
                'permissions', (
                  SELECT jsonb_agg(jsonb_build_object(
                    'permissionKey', permission_key,
                    'scopes', jsonb_build_array('ALL')
                  ) ORDER BY permission_key)
                  FROM unnest(legacy_permissions) AS permission_key
                )
              )
            )
          );
        END IF;

        -- Never rewrite a seeded or UI-edited role. Metadata edits are safe;
        -- archived/divergent grants cannot preserve the old authority exactly.
        IF legacy_role."archivedAt" IS NOT NULL
          OR (SELECT count(*) FROM "RolePermission" WHERE "roleId" = legacy_role.id)
            <> cardinality(legacy_permissions)
          OR EXISTS (
            SELECT 1 FROM "RolePermission" p
            WHERE p."roleId" = legacy_role.id
              AND (
                NOT (p."permissionKey" = ANY(legacy_permissions))
                OR p.scopes IS DISTINCT FROM ARRAY['ALL']::"PermissionScope"[]
              )
          )
        THEN
          RAISE EXCEPTION 'Cannot migrate legacy ADMIN access: legacy-administrator is archived or its permissions differ from the frozen legacy grants. Review the conflicting role before retrying; no accounts or roles were changed';
        END IF;
      END IF;

      INSERT INTO "UserRole" ("userId", "roleId")
      VALUES (candidate.id, legacy_role.id);
      assigned_role_ids := ARRAY[legacy_role.id];
    END IF;

    UPDATE "User"
    SET "loginStatus" = 'ACTIVE',
        "isSuperAdmin" = becomes_super_admin,
        "accessRevision" = "accessRevision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = candidate.id;

    -- Required audit participates in the same transaction as every grant.
    INSERT INTO "AuditEvent" (id, "userId", type, "targetType", "targetId", meta)
    VALUES (
      'migration-20261011122000-user-' || md5(candidate.id),
      NULL,
      'ACCESS_USER_CHANGED',
      'User',
      candidate.id,
      jsonb_build_object(
        'source', migration_source,
        'actor', 'system',
        'cutoverAt', cutover_at,
        'legacyRoles', to_jsonb(candidate.roles),
        'before', jsonb_build_object(
          'loginStatus', candidate."loginStatus",
          'isSuperAdmin', candidate."isSuperAdmin",
          'accessRevision', candidate."accessRevision",
          'roleIds', jsonb_build_array()
        ),
        'after', jsonb_build_object(
          'loginStatus', 'ACTIVE',
          'isSuperAdmin', becomes_super_admin,
          'accessRevision', candidate."accessRevision" + 1,
          'roleIds', to_jsonb(assigned_role_ids)
        )
      )
    );
  END LOOP;
END
$migration$;

COMMIT;
