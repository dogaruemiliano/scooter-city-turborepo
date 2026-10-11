/**
 * Opt-in PostgreSQL rehearsal. Point LEGACY_ACCESS_MIGRATION_DATABASE_URL and
 * DATABASE_URL at an empty local scooter_access_test_legacy_* database migrated
 * through 20261011121000_access_integrity. Run with the existing E2E Jest config.
 * Every scenario rolls back its own fixtures and migration effects; no database
 * is created, reset, dropped, or cleaned with broad DELETE statements here.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.LEGACY_ACCESS_MIGRATION_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const migrationName = "20261011122000_migrate_legacy_access";
const cutoverName = "20261011120000_user_access_and_roles";

// Frozen compatibility contract: do not inherit permissions added in future.
const legacyPermissions = [
  "persons.read",
  "persons.create",
  "persons.update",
  "persons.archive",
  "persons.audit.read",
  "person_documents.read",
  "person_documents.write",
  "person_documents.delete",
  "person_documents.extract",
  "scooters.read",
  "scooters.create",
  "scooters.update",
  "scooters.archive",
  "scooter_documents.read",
  "scooter_documents.write",
  "scooter_documents.extract",
  "scooter_brands.read",
  "scooter_brands.manage",
  "vehicle_civ.read",
  "finance.books.read",
  "finance.suppliers.read",
  "finance.accounts.read",
  "finance.operations.read",
  "finance.reference.read",
  "finance.suppliers.manage",
  "finance.expenses.create",
  "finance.funding.create",
  "finance.operations.reverse",
  "finance.settlements.preview",
].sort();

type UserRow = {
  id: string;
  roles: string[];
  loginStatus: string;
  isSuperAdmin: boolean;
  accessRevision: number;
};
type RoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  revision: number;
  archivedAt: Date | null;
};
type AuditRow = {
  userId: string | null;
  type: string;
  targetType: string | null;
  targetId: string | null;
  meta: {
    source: string;
    before: unknown;
    after: unknown;
    legacyRoles?: string[];
  };
};

integration("Legacy roles SQL migration (PostgreSQL)", () => {
  let db: Client;
  let migrationBody: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !/^\/scooter_access_test_legacy_[a-z0-9_]+$/u.test(url.pathname)
    ) {
      throw new Error(
        "Use a dedicated local scooter_access_test_legacy_* database",
      );
    }
    db = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    await db.connect();
    const existing = await db.query<{ count: string }>(
      'SELECT count(*) FROM "User"',
    );
    if (existing.rows[0].count !== "0")
      throw new Error(
        "Migration rehearsal requires an empty dedicated database",
      );
    const migrations = await db.query<{ migration_name: string }>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    expect(migrations.rows.map((row) => row.migration_name)).toContain(
      cutoverName,
    );
    expect(migrations.rows.map((row) => row.migration_name)).toContain(
      "20261011121000_access_integrity",
    );
    expect(migrations.rows.map((row) => row.migration_name)).not.toContain(
      migrationName,
    );
    const sql = readFileSync(
      path.join(
        __dirname,
        "../prisma/migrations",
        migrationName,
        "migration.sql",
      ),
      "utf8",
    );
    // The harness supplies the outer transaction so all tests can roll back.
    // Keep every statement inside the production migration unchanged.
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    migrationBody = sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  }, 30_000);

  beforeEach(async () => {
    await db.query("BEGIN");
    // User timestamps have millisecond precision. Make equality an exact
    // boundary fixture instead of depending on migration-clock rounding.
    await db.query(
      "UPDATE \"_prisma_migrations\" SET started_at = date_trunc('milliseconds', started_at) WHERE migration_name = $1",
      [cutoverName],
    );
  });
  afterEach(async () => {
    await db?.query("ROLLBACK");
  });
  afterAll(async () => {
    await db?.end();
  });

  async function user(
    roles: string[],
    options: {
      revision?: number;
      status?: string;
      superAdmin?: boolean;
      deleted?: boolean;
      created?: "before" | "at" | "after";
    } = {},
  ) {
    const id = randomUUID();
    const offset = { before: "-1 second", at: "0 seconds", after: "1 second" }[
      options.created ?? "before"
    ];
    await db.query(
      `
      INSERT INTO "User" (id, email, roles, "createdAt", "updatedAt", "loginStatus", "isSuperAdmin", "accessRevision", "deletedAt")
      SELECT $1, $2, $3::text[], (started_at AT TIME ZONE 'UTC') + $4::interval,
        now(), $5::"LoginStatus", $6, $7, CASE WHEN $8::boolean THEN now() ELSE NULL END
      FROM "_prisma_migrations" WHERE migration_name = $9 AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY started_at LIMIT 1`,
      [
        id,
        `${id}@example.test`,
        roles,
        offset,
        options.status ?? "DISABLED",
        options.superAdmin ?? false,
        options.revision ?? 1,
        options.deleted ?? false,
        cutoverName,
      ],
    );
    return id;
  }
  async function readUser(id: string) {
    const result = await db.query<UserRow>(
      'SELECT * FROM "User" WHERE id = $1',
      [id],
    );
    return result.rows[0];
  }
  async function compatibilityRole(
    options: {
      archived?: boolean;
      edited?: boolean;
      metadataEdited?: boolean;
    } = {},
  ) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO "Role" (id, slug, name, description, revision, "updatedAt", "archivedAt")
      VALUES ($1, 'legacy-administrator', $2, $3, $4, now(), CASE WHEN $5::boolean THEN now() ELSE NULL END)`,
      [
        id,
        options.metadataEdited ? "Renamed staff role" : "Legacy administrator",
        "Operator-maintained description",
        options.metadataEdited ? 8 : 1,
        options.archived ?? false,
      ],
    );
    const permissions = options.edited
      ? legacyPermissions.filter((key) => key !== "persons.archive")
      : legacyPermissions;
    await db.query(
      `INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes)
      SELECT $1, permission, ARRAY['ALL']::"PermissionScope"[] FROM unnest($2::text[]) AS permission`,
      [id, permissions],
    );
    return id;
  }
  async function snapshot() {
    const result: Record<string, unknown[]> = {};
    for (const table of [
      "User",
      "Role",
      "RolePermission",
      "UserRole",
      "UserPermissionOverride",
      "UserInvitation",
      "Session",
      "RefreshToken",
      "AuditEvent",
    ] as const) {
      const rows = await db.query<{ value: unknown }>(
        `SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`,
      );
      result[table] = rows.rows.map((row) => row.value);
    }
    return result;
  }
  async function migrate() {
    await db.query(migrationBody);
  }
  async function audit() {
    return (
      await db.query<AuditRow>(
        'SELECT * FROM "AuditEvent" WHERE meta->>\'source\' = $1 ORDER BY type, "targetId"',
        [migrationName],
      )
    ).rows;
  }
  async function expectAtomicFailure(message: RegExp) {
    const before = await snapshot();
    await db.query("SAVEPOINT before_migration");
    await expect(migrate()).rejects.toThrow(message);
    await db.query("ROLLBACK TO SAVEPOINT before_migration");
    expect(await snapshot()).toEqual(before);
  }

  it("activates ADMIN and promotes SUPER_ADMIN with precedence, frozen grants, retained sessions, and required audits", async () => {
    const admin = await user(["ADMIN"]);
    const superAdmin = await user(["SUPER_ADMIN"]);
    const both = await user(["ADMIN", "SUPER_ADMIN"]);
    const session = randomUUID();
    await db.query('INSERT INTO "Session" (id, "userId") VALUES ($1, $2)', [
      session,
      admin,
    ]);
    await db.query(
      `INSERT INTO "RefreshToken" (id, jti, "sessionId", "userId", "tokenHash", "expiresAt")
      VALUES ($1, $2, $3, $4, 'existing-hash', now() + interval '1 day')`,
      [randomUUID(), randomUUID(), session, admin],
    );
    const before = await snapshot();
    await migrate();
    expect(await readUser(admin)).toMatchObject({
      roles: ["ADMIN"],
      loginStatus: "ACTIVE",
      isSuperAdmin: false,
      accessRevision: 2,
    });
    for (const id of [superAdmin, both]) {
      expect(await readUser(id)).toMatchObject({
        loginStatus: "ACTIVE",
        isSuperAdmin: true,
        accessRevision: 2,
      });
    }
    const roles = await db.query<RoleRow>('SELECT * FROM "Role"');
    expect(roles.rows).toHaveLength(1);
    expect(roles.rows[0].slug).toBe("legacy-administrator");
    const assignments = await db.query<{ userId: string; roleId: string }>(
      'SELECT "userId", "roleId" FROM "UserRole"',
    );
    expect(assignments.rows).toEqual([
      { userId: admin, roleId: roles.rows[0].id },
    ]);
    const grants = await db.query<{ permissionKey: string; scopes: string[] }>(
      'SELECT "permissionKey", scopes::text[] AS scopes FROM "RolePermission" ORDER BY "permissionKey"',
    );
    expect(grants.rows).toEqual(
      legacyPermissions.map((permissionKey) => ({
        permissionKey,
        scopes: ["ALL"],
      })),
    );
    const after = await snapshot();
    expect(after.Session).toEqual(before.Session);
    expect(after.RefreshToken).toEqual(before.RefreshToken);
    const events = await audit();
    expect(
      events.filter((event) => event.type === "ACCESS_ROLE_CREATED"),
    ).toHaveLength(1);
    const users = events.filter(
      (event) => event.type === "ACCESS_USER_CHANGED",
    );
    expect(users.map((event) => event.targetId).sort()).toEqual(
      [admin, superAdmin, both].sort(),
    );
    for (const event of users) {
      expect(event).toMatchObject({
        userId: null,
        targetType: "User",
        meta: {
          source: migrationName,
          before: {
            loginStatus: "DISABLED",
            isSuperAdmin: false,
            accessRevision: 1,
          },
          after: { loginStatus: "ACTIVE", accessRevision: 2 },
        },
      });
    }
  });

  it("keeps unknown, roleless, deleted, and post-cutover access decisions unchanged", async () => {
    await user([]);
    await user(["MECHANIC"]);
    await user(["admin"]);
    await user(["ADMIN"], { deleted: true });
    await user(["SUPER_ADMIN"], { deleted: true });
    await user(["ADMIN"], { revision: 2 });
    await user(["SUPER_ADMIN"], { status: "SUSPENDED" });
    await user(["ADMIN"], { status: "INVITED" });
    await user(["ADMIN"], { status: "ACTIVE" });
    await user(["SUPER_ADMIN"], { superAdmin: true });
    await user(["ADMIN"], { created: "after" });
    const custom = await compatibilityRole({ metadataEdited: true });
    const withRole = await user(["ADMIN", "SUPER_ADMIN"]);
    await db.query(
      'INSERT INTO "UserRole" ("userId", "roleId") VALUES ($1, $2)',
      [withRole, custom],
    );
    const withOverride = await user(["SUPER_ADMIN"]);
    await db.query(
      `INSERT INTO "UserPermissionOverride" ("userId", "permissionKey", scopes, "updatedAt")
      VALUES ($1, 'persons.read', ARRAY[]::"PermissionScope"[], now())`,
      [withOverride],
    );
    const withInvitation = await user(["ADMIN"]);
    await db.query(
      `INSERT INTO "UserInvitation" (id, "userId", email, generation, "expiresAt", "cancelledAt")
      SELECT $1, id, email, 1, now() - interval '1 day', now() FROM "User" WHERE id = $2`,
      [randomUUID(), withInvitation],
    );
    const before = await snapshot();
    await migrate();
    expect(await snapshot()).toEqual(before);
    expect(await audit()).toEqual([]);
  });

  it.each(["UTC", "Europe/Bucharest", "America/Los_Angeles"])(
    "uses the strict UTC cutover boundary under session timezone %s",
    async (zone) => {
      await db.query("SELECT set_config('TimeZone', $1, true)", [zone]);
      const old = await user(["ADMIN"]);
      const at = await user(["ADMIN"], { created: "at" });
      const newer = await user(["ADMIN"], { created: "after" });
      await migrate();
      expect((await readUser(old)).loginStatus).toBe("ACTIVE");
      expect((await readUser(at)).loginStatus).toBe("DISABLED");
      expect((await readUser(newer)).loginStatus).toBe("DISABLED");
    },
  );

  it("is idempotent and never restores an explicit subsequent suspension or super-admin demotion", async () => {
    const admin = await user(["ADMIN"]);
    const superAdmin = await user(["SUPER_ADMIN"]);
    await migrate();
    const first = await snapshot();
    await migrate();
    expect(await snapshot()).toEqual(first);
    await db.query(
      `UPDATE "User" SET "loginStatus" = 'DISABLED', "isSuperAdmin" = false,
      "accessRevision" = "accessRevision" + 1 WHERE id = ANY($1::text[])`,
      [[admin, superAdmin]],
    );
    const restricted = await snapshot();
    await migrate();
    expect(await snapshot()).toEqual(restricted);
  });

  it.each(["archived", "edited", "scope", "unknown-key"] as const)(
    "fails atomically when the compatibility role is %s",
    async (kind) => {
      const role = await compatibilityRole({
        archived: kind === "archived",
        edited: kind === "edited",
      });
      if (kind === "scope") {
        await db.query(
          `UPDATE "RolePermission" SET scopes = ARRAY['ASSIGNED']::"PermissionScope"[] WHERE "roleId" = $1 AND "permissionKey" = 'scooters.read'`,
          [role],
        );
      }
      if (kind === "unknown-key") {
        await db.query(
          `UPDATE "RolePermission" SET "permissionKey" = 'future.operation' WHERE "roleId" = $1 AND "permissionKey" = 'persons.read'`,
          [role],
        );
      }
      await user(["SUPER_ADMIN"]);
      await user(["ADMIN"]);
      await expectAtomicFailure(/legacy|compatibility|role/i);
    },
  );

  it("reuses exact compatibility grants while preserving role metadata edits and revision", async () => {
    const id = await compatibilityRole({ metadataEdited: true });
    const before = await db.query<RoleRow>(
      'SELECT * FROM "Role" WHERE id = $1',
      [id],
    );
    const admin = await user(["ADMIN"]);
    await migrate();
    const after = await db.query<RoleRow>(
      'SELECT * FROM "Role" WHERE id = $1',
      [id],
    );
    expect(after.rows).toEqual(before.rows);
    expect((await readUser(admin)).loginStatus).toBe("ACTIVE");
    expect((await audit()).map((event) => event.type)).toEqual([
      "ACCESS_USER_CHANGED",
    ]);
  });

  it("does not consult conflicting compatibility grants when only a super admin needs migration", async () => {
    await compatibilityRole({ archived: true, edited: true });
    const id = await user(["ADMIN", "SUPER_ADMIN"]);
    await migrate();
    expect(await readUser(id)).toMatchObject({
      loginStatus: "ACTIVE",
      isSuperAdmin: true,
    });
    expect((await db.query('SELECT * FROM "UserRole"')).rowCount).toBe(0);
  });

  it("rolls account and role changes back when the required audit insert fails", async () => {
    await user(["ADMIN"]);
    await db.query(`CREATE FUNCTION legacy_test_reject_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.meta->>'source' = '${migrationName}' AND NEW.type = 'ACCESS_USER_CHANGED' THEN RAISE EXCEPTION 'audit write rejected'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER legacy_test_reject_audit BEFORE INSERT ON "AuditEvent"
        FOR EACH ROW EXECUTE FUNCTION legacy_test_reject_audit();`);
    await expectAtomicFailure(/audit write rejected/);
  });

  it("fails closed when the recorded cutover is unavailable for an untouched legacy account", async () => {
    await user(["ADMIN"]);
    await db.query(
      'UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE migration_name = $1',
      [cutoverName],
    );
    await expectAtomicFailure(/cutover/i);
  });

  it("permits an empty fresh database without a cutover marker", async () => {
    await db.query(
      'UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE migration_name = $1',
      [cutoverName],
    );
    const before = await snapshot();
    await migrate();
    expect(await snapshot()).toEqual(before);
  });
});
