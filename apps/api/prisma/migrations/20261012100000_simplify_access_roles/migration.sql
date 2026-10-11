-- Consolidate the public roles without granting or revoking any existing access.
-- Existing overrides (including their reasons) and all admission flags survive.
-- Fixed catalog/grants describe this migration's release, never future grants.
BEGIN;
SELECT pg_advisory_xact_lock(726001);
LOCK TABLE "Role", "RolePermission", "UserRole", "UserPermissionOverride"
  IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  source CONSTANT TEXT := '20261012100000_simplify_access_roles';
  migration_marker CONSTANT TEXT := 'migration-20261012100000-complete';
  preset RECORD;
  member RECORD;
  old_role RECORD;
  target_role_id TEXT;
  old_state JSONB;
BEGIN
  -- A durable completion marker also protects an operator's later access edits
  -- if this SQL is explicitly rerun outside Prisma's migration ledger.
  IF EXISTS (SELECT 1 FROM "AuditEvent" WHERE id = migration_marker) THEN
    RETURN;
  END IF;
  PERFORM 1 FROM "User" ORDER BY id FOR UPDATE;

  CREATE TEMP TABLE fixed_role_catalog (
    key TEXT PRIMARY KEY, scopes "PermissionScope"[] NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO fixed_role_catalog VALUES
  ('persons.read', ARRAY['ALL']::"PermissionScope"[]),
  ('persons.create', ARRAY['ALL']::"PermissionScope"[]),
  ('persons.update', ARRAY['ALL']::"PermissionScope"[]),
  ('persons.archive', ARRAY['ALL']::"PermissionScope"[]),
  ('persons.audit.read', ARRAY['ALL']::"PermissionScope"[]),
  ('person_documents.read', ARRAY['ALL']::"PermissionScope"[]),
  ('person_documents.write', ARRAY['ALL']::"PermissionScope"[]),
  ('person_documents.delete', ARRAY['ALL']::"PermissionScope"[]),
  ('person_documents.extract', ARRAY['ALL']::"PermissionScope"[]),
  ('scooters.read', ARRAY['ASSIGNED','ALL']::"PermissionScope"[]),
  ('scooters.create', ARRAY['ALL']::"PermissionScope"[]),
  ('scooters.update', ARRAY['ALL']::"PermissionScope"[]),
  ('scooters.archive', ARRAY['ALL']::"PermissionScope"[]),
  ('scooter_documents.read', ARRAY['ALL']::"PermissionScope"[]),
  ('scooter_documents.write', ARRAY['ALL']::"PermissionScope"[]),
  ('scooter_documents.extract', ARRAY['ALL']::"PermissionScope"[]),
  ('scooter_brands.read', ARRAY['ALL']::"PermissionScope"[]),
  ('scooter_brands.manage', ARRAY['ALL']::"PermissionScope"[]),
  ('vehicle_civ.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.books.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.suppliers.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.accounts.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.operations.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.reference.read', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.suppliers.manage', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.expenses.create', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.funding.create', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.operations.reverse', ARRAY['ALL']::"PermissionScope"[]),
  ('finance.settlements.preview', ARRAY['ALL']::"PermissionScope"[]),
  ('problems.read', ARRAY['ASSIGNED','AVAILABLE','ALL']::"PermissionScope"[]),
  ('problems.create', ARRAY['ALL']::"PermissionScope"[]),
  ('problems.update', ARRAY['ASSIGNED','ALL']::"PermissionScope"[]),
  ('problems.resolve', ARRAY['ASSIGNED','ALL']::"PermissionScope"[]),
  ('problems.claim', ARRAY['AVAILABLE']::"PermissionScope"[]),
  ('problems.assign', ARRAY['ALL']::"PermissionScope"[]),
  ('problems.prioritize', ARRAY['ALL']::"PermissionScope"[]),
  ('problems.reopen', ARRAY['ALL']::"PermissionScope"[]),
  ('portal.profile.read', ARRAY['OWN']::"PermissionScope"[]),
  ('portal.rentals.read', ARRAY['OWN']::"PermissionScope"[]),
  ('portal.scooter_documents.read', ARRAY['OWN']::"PermissionScope"[]),
  ('rentals.read', ARRAY['ALL']::"PermissionScope"[]),
  ('rentals.create', ARRAY['ALL']::"PermissionScope"[]),
  ('rentals.handover', ARRAY['ALL']::"PermissionScope"[]),
  ('rentals.return', ARRAY['ALL']::"PermissionScope"[]);

  CREATE TEMP TABLE fixed_role_grants (
    slug TEXT, key TEXT, scopes "PermissionScope"[], PRIMARY KEY (slug, key)
  ) ON COMMIT DROP;
  INSERT INTO fixed_role_grants
  SELECT 'admin', key,
    CASE WHEN key = 'problems.claim' THEN ARRAY['AVAILABLE']::"PermissionScope"[]
      ELSE ARRAY['ALL']::"PermissionScope"[] END
  FROM fixed_role_catalog WHERE key NOT LIKE 'portal.%';
  INSERT INTO fixed_role_grants VALUES
    ('mechanic', 'problems.read', ARRAY['ASSIGNED','AVAILABLE']::"PermissionScope"[]),
    ('mechanic', 'problems.claim', ARRAY['AVAILABLE']::"PermissionScope"[]),
    ('mechanic', 'problems.update', ARRAY['ASSIGNED']::"PermissionScope"[]),
    ('mechanic', 'problems.resolve', ARRAY['ASSIGNED']::"PermissionScope"[]),
    ('mechanic', 'scooters.read', ARRAY['ASSIGNED']::"PermissionScope"[]);
  INSERT INTO fixed_role_grants
  SELECT 'customer', key, ARRAY['OWN']::"PermissionScope"[]
  FROM fixed_role_catalog WHERE key LIKE 'portal.%';

  CREATE TEMP TABLE fixed_role_before ON COMMIT DROP AS
  SELECT r.*, to_jsonb(r) || jsonb_build_object('permissions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('permissionKey', p."permissionKey", 'scopes', p.scopes)
      ORDER BY p."permissionKey") FROM "RolePermission" p WHERE p."roleId" = r.id
  ), '[]'::jsonb)) AS state FROM "Role" r;

  CREATE TEMP TABLE fixed_member_before ON COMMIT DROP AS
  SELECT u.id, u."accessRevision",
    CASE
      WHEN bool_or(r."archivedAt" IS NULL AND r.slug NOT IN ('mechanic', 'customer')) THEN 'admin'
      WHEN bool_or(r."archivedAt" IS NULL AND r.slug = 'mechanic') THEN 'mechanic'
      WHEN bool_or(r."archivedAt" IS NULL AND r.slug = 'customer') THEN 'customer'
      ELSE NULL
    END AS target_slug,
    jsonb_build_object('roleIds', jsonb_agg(r.id ORDER BY r.id),
      'accessRevision', u."accessRevision", 'loginStatus', u."loginStatus",
      'isSuperAdmin', u."isSuperAdmin", 'overrides', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) ORDER BY o."permissionKey")
        FROM "UserPermissionOverride" o WHERE o."userId" = u.id
      ), '[]'::jsonb)) AS state
  FROM "User" u JOIN "UserRole" ur ON ur."userId" = u.id
    JOIN "Role" r ON r.id = ur."roleId"
  GROUP BY u.id;

  -- Reproduce the resolver's normalized union of valid, active role grants.
  -- Existing per-action overrides stay untouched and continue replacing this
  -- union. Preserving the union also preserves prerequisite enforcement.
  CREATE TEMP TABLE fixed_inherited_before ON COMMIT DROP AS
  SELECT m.id AS user_id, c.key,
    CASE WHEN 'ALL'::"PermissionScope" = ANY(granted.scopes)
      THEN ARRAY['ALL']::"PermissionScope"[] ELSE granted.scopes END AS scopes
  FROM fixed_member_before m CROSS JOIN fixed_role_catalog c
  CROSS JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT s.scope FROM "UserRole" ur
      JOIN "Role" r ON r.id = ur."roleId" AND r."archivedAt" IS NULL
      JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = c.key
      CROSS JOIN LATERAL unnest(p.scopes) s(scope)
      WHERE ur."userId" = m.id AND p.scopes <@ c.scopes
      ORDER BY s.scope
    ) AS scopes
  ) granted;

  FOR preset IN SELECT * FROM (VALUES
    ('admin', 'Admin', 'Manage scooters, repairs, rentals, people, and finance. Access management requires Super Admin.'),
    ('mechanic', 'Mechanic', 'Claim available repairs and work on assigned scooters and problems.'),
    ('customer', 'Client', 'View own rental details and published documents when customer portal access is enabled.')
  ) AS presets(slug, name, description)
  LOOP
    SELECT state INTO old_state FROM fixed_role_before WHERE slug = preset.slug;
    INSERT INTO "Role" (id, slug, name, description, "updatedAt")
    VALUES ('migration-20261012100000-' || preset.slug, preset.slug, preset.name, preset.description, CURRENT_TIMESTAMP)
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, "archivedAt" = NULL,
      revision = "Role".revision + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING id INTO target_role_id;
    DELETE FROM "RolePermission" WHERE "roleId" = target_role_id;
    INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
    SELECT target_role_id, key, scopes FROM fixed_role_grants WHERE slug = preset.slug;
    INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
    VALUES ('migration-20261012100000-role-' || preset.slug,
      CASE WHEN old_state IS NULL THEN 'ACCESS_ROLE_CREATED' ELSE 'ACCESS_ROLE_CHANGED' END,
      'Role', target_role_id, jsonb_build_object('source', source, 'actor', 'system',
        'before', old_state, 'after', jsonb_build_object('slug', preset.slug,
          'permissions', (SELECT jsonb_agg(jsonb_build_object('permissionKey', key, 'scopes', scopes) ORDER BY key)
            FROM fixed_role_grants WHERE slug = preset.slug))));
  END LOOP;

  FOR member IN SELECT * FROM fixed_member_before ORDER BY id LOOP
    target_role_id := NULL;
    IF member.target_slug IS NOT NULL THEN
      SELECT id INTO target_role_id FROM "Role" WHERE slug = member.target_slug;
    END IF;
    -- Differences become explicit exceptions, including deny overrides for
    -- newly available Admin actions. Existing overrides/reasons are preserved.
    INSERT INTO "UserPermissionOverride" ("userId", "permissionKey", scopes, reason, "updatedAt")
    SELECT member.id, before.key, before.scopes,
      'Access preserved when roles were simplified.', CURRENT_TIMESTAMP
    FROM fixed_inherited_before before
    LEFT JOIN fixed_role_grants after ON after.slug = member.target_slug AND after.key = before.key
    WHERE before.user_id = member.id
      AND before.scopes IS DISTINCT FROM COALESCE(after.scopes, ARRAY[]::"PermissionScope"[])
    ON CONFLICT ("userId", "permissionKey") DO NOTHING;

    DELETE FROM "UserRole" WHERE "userId" = member.id;
    IF target_role_id IS NOT NULL THEN
      INSERT INTO "UserRole" ("userId", "roleId") VALUES (member.id, target_role_id);
    END IF;
    UPDATE "User" SET "accessRevision" = "accessRevision" + 1,
      "updatedAt" = CURRENT_TIMESTAMP WHERE id = member.id;
    INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
    VALUES ('migration-20261012100000-user-' || md5(member.id), 'ACCESS_USER_CHANGED', 'User', member.id,
      jsonb_build_object('source', source, 'actor', 'system', 'before', member.state,
        'after', jsonb_build_object('baseRole', member.target_slug,
          'accessRevision', member."accessRevision" + 1,
          'overrides', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o."permissionKey")
            FROM "UserPermissionOverride" o WHERE o."userId" = member.id), '[]'::jsonb))));
  END LOOP;

  -- Retain retired roles and grants for history; never delete their definitions.
  FOR old_role IN SELECT * FROM fixed_role_before
    WHERE slug NOT IN ('admin', 'mechanic', 'customer') AND "archivedAt" IS NULL
  LOOP
    UPDATE "Role" SET "archivedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = old_role.id;
    INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
    VALUES ('migration-20261012100000-retired-' || md5(old_role.id), 'ACCESS_ROLE_ARCHIVED', 'Role', old_role.id,
      jsonb_build_object('source', source, 'actor', 'system', 'before', old_role.state,
        'after', jsonb_build_object('archived', true)));
  END LOOP;
  INSERT INTO "AuditEvent" (id, type, "targetType", "targetId", meta)
  VALUES (migration_marker, 'ACCESS_ROLES_SIMPLIFIED', 'Access', source,
    jsonb_build_object('source', source, 'actor', 'system', 'membersConverted',
      (SELECT count(*) FROM fixed_member_before)));
END
$migration$;
COMMIT;
