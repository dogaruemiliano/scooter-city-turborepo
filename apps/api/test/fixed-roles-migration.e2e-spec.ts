/** SQL rehearsal: explicit empty local database; every scenario rolls back. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { v1 } from "@repo/api-shared";
import { initialRoles } from "../prisma/seeds/access";
import {
  enforcePrerequisites,
  resolveScopes,
  type GrantRow,
} from "../src/access/access.resolver";

const databaseUrl = process.env.FIXED_ROLES_MIGRATION_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const migrationName = "20261012100000_simplify_access_roles";
const marker = "migration-20261012100000-complete";

integration("Fixed role migration preserves authority (PostgreSQL)", () => {
  let db: Client;
  let migration: string;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !/^\/scooter_access_test_(legacy|fixed)_[a-z0-9_]+$/u.test(url.pathname)
    )
      throw new Error(
        "Use an isolated local scooter_access_test_legacy/fixed_* database",
      );
    db = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    await db.connect();
    expect(
      (await db.query<{ count: string }>('SELECT count(*) FROM "User"')).rows[0]
        .count,
    ).toBe("0");
    expect(
      (await db.query<{ count: string }>('SELECT count(*) FROM "Role"')).rows[0]
        .count,
    ).toBe("0");
    const sql = readFileSync(
      path.join(
        __dirname,
        "../prisma/migrations",
        migrationName,
        "migration.sql",
      ),
      "utf8",
    );
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    migration = sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  });
  beforeEach(async () => {
    await db.query("BEGIN");
  });
  afterEach(async () => {
    await db?.query("ROLLBACK");
  });
  afterAll(async () => {
    await db?.end();
  });

  async function role(
    slug: string,
    grants: readonly GrantRow[],
    archived = false,
  ) {
    const id = randomUUID();
    await db.query(
      'INSERT INTO "Role" (id, slug, name, "updatedAt", "archivedAt") VALUES ($1,$2,$2,now(),CASE WHEN $3 THEN now() ELSE NULL END)',
      [id, slug, archived],
    );
    for (const grant of grants)
      await db.query(
        'INSERT INTO "RolePermission" ("roleId", "permissionKey", scopes) VALUES ($1,$2,$3::"PermissionScope"[])',
        [id, grant.permissionKey, grant.scopes],
      );
    return id;
  }
  async function user(
    roleIds: string[] = [],
    overrides: (GrantRow & { reason?: string })[] = [],
    options: { status?: string; superAdmin?: boolean; deleted?: boolean } = {},
  ) {
    const id = randomUUID();
    await db.query(
      'INSERT INTO "User" (id,email,"updatedAt","loginStatus","isSuperAdmin","deletedAt") VALUES ($1,$2,now(),$3::"LoginStatus",$4,CASE WHEN $5 THEN now() ELSE NULL END)',
      [
        id,
        `${id}@example.test`,
        options.status ?? "ACTIVE",
        options.superAdmin ?? false,
        options.deleted ?? false,
      ],
    );
    for (const roleId of roleIds)
      await db.query(
        'INSERT INTO "UserRole" ("userId","roleId") VALUES ($1,$2)',
        [id, roleId],
      );
    for (const override of overrides)
      await db.query(
        'INSERT INTO "UserPermissionOverride" ("userId","permissionKey",scopes,reason,"updatedAt") VALUES ($1,$2,$3::"PermissionScope"[],$4,now())',
        [id, override.permissionKey, override.scopes, override.reason ?? null],
      );
    return id;
  }
  async function authority(id: string) {
    const grants = await db.query<GrantRow>(
      'SELECT p."permissionKey",p.scopes::text[] AS scopes FROM "UserRole" ur JOIN "Role" r ON r.id=ur."roleId" JOIN "RolePermission" p ON p."roleId"=r.id WHERE ur."userId"=$1 AND r."archivedAt" IS NULL',
      [id],
    );
    const overrides = await db.query<GrantRow>(
      'SELECT "permissionKey",scopes::text[] AS scopes FROM "UserPermissionOverride" WHERE "userId"=$1',
      [id],
    );
    const scopes = enforcePrerequisites(
      resolveScopes(grants.rows, overrides.rows),
    );
    return Object.fromEntries(
      v1.access.permissionKeys.map((key) => [key, scopes[key] ?? []]),
    );
  }
  async function baseRole(id: string) {
    return (
      await db.query<{ slug: string }>(
        'SELECT r.slug FROM "UserRole" ur JOIN "Role" r ON r.id=ur."roleId" WHERE ur."userId"=$1',
        [id],
      )
    ).rows.map((r) => r.slug);
  }

  it("creates exactly three canonical presets on an empty installation", async () => {
    await db.query(migration);
    const roles = await db.query<{ slug: string; name: string }>(
      'SELECT slug,name FROM "Role" WHERE "archivedAt" IS NULL ORDER BY slug',
    );
    expect(roles.rows).toEqual([
      { slug: "admin", name: "Admin" },
      { slug: "customer", name: "Client" },
      { slug: "mechanic", name: "Mechanic" },
    ]);
    for (const preset of initialRoles) {
      const grants = await db.query<GrantRow>(
        'SELECT "permissionKey",scopes::text[] AS scopes FROM "RolePermission" p JOIN "Role" r ON r.id=p."roleId" WHERE r.slug=$1 ORDER BY "permissionKey"',
        [preset.slug],
      );
      expect(grants.rows).toEqual(
        [...preset.permissions].sort((a, b) =>
          a.permissionKey.localeCompare(b.permissionKey),
        ),
      );
    }
  });

  it.each(["ADMIN", "SUPER_ADMIN"])(
    "chains the production legacy %s conversion without changing its authority",
    async (legacyRole) => {
      const id = await user([], [], { status: "DISABLED" });
      await db.query(
        `UPDATE "User" SET roles = ARRAY[$2]::text[], "createdAt" = (
      SELECT min(started_at) AT TIME ZONE 'UTC' FROM "_prisma_migrations"
      WHERE migration_name = '20261011120000_user_access_and_roles' AND finished_at IS NOT NULL
    ) - INTERVAL '1 second' WHERE id=$1`,
        [id, legacyRole],
      );
      const legacySql = readFileSync(
        path.join(
          __dirname,
          "../prisma/migrations/20261011122000_migrate_legacy_access/migration.sql",
        ),
        "utf8",
      )
        .replace(/^BEGIN;$/m, "")
        .replace(/^COMMIT;$/m, "");
      await db.query(legacySql);
      const before = await authority(id);
      await db.query(migration);
      expect(await authority(id)).toEqual(before);
      expect(await baseRole(id)).toEqual(
        legacyRole === "ADMIN" ? ["admin"] : [],
      );
      expect(
        (
          await db.query(
            'SELECT "loginStatus", "isSuperAdmin" FROM "User" WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual({
        loginStatus: "ACTIVE",
        isSuperAdmin: legacyRole === "SUPER_ADMIN",
      });
    },
  );

  it.each([
    "legacy-administrator",
    "operations-manager",
    "service-coordinator",
    "rental-agent",
    "finance-operator",
    "custom-dispatcher",
  ])("maps %s to Admin while preserving restricted access", async (slug) => {
    const id = await user([
      await role(slug, [{ permissionKey: "scooters.read", scopes: ["ALL"] }]),
    ]);
    const before = await authority(id);
    await db.query(migration);
    expect(await baseRole(id)).toEqual(["admin"]);
    expect(await authority(id)).toEqual(before);
    expect(
      (
        await db.query(
          'SELECT scopes::text[] AS scopes FROM "UserPermissionOverride" WHERE "userId"=$1 AND "permissionKey"=\'rentals.create\'',
          [id],
        )
      ).rows,
    ).toEqual([{ scopes: [] }]);
    expect(
      (
        await db.query<{ archivedAt: Date | null }>(
          'SELECT "archivedAt" FROM "Role" WHERE slug=$1',
          [slug],
        )
      ).rows[0].archivedAt,
    ).not.toBeNull();
  });

  it.each(["mechanic", "customer"])(
    "keeps %s as the base and preserves an edited preset's access",
    async (slug) => {
      const id = await user([
        await role(slug, [{ permissionKey: "scooters.read", scopes: ["ALL"] }]),
      ]);
      const before = await authority(id);
      await db.query(migration);
      expect(await baseRole(id)).toEqual([slug]);
      expect(await authority(id)).toEqual(before);
    },
  );

  it("collapses mechanic plus Client into Mechanic and explicit portal exceptions", async () => {
    const mechanic = initialRoles.find((r) => r.slug === "mechanic")!;
    const customer = initialRoles.find((r) => r.slug === "customer")!;
    const id = await user([
      await role(mechanic.slug, mechanic.permissions),
      await role(customer.slug, customer.permissions),
    ]);
    const before = await authority(id);
    await db.query(migration);
    expect(await baseRole(id)).toEqual(["mechanic"]);
    expect(await authority(id)).toEqual(before);
    expect(
      (
        await db.query(
          'SELECT "permissionKey",scopes::text[] AS scopes FROM "UserPermissionOverride" WHERE "userId"=$1 ORDER BY "permissionKey"',
          [id],
        )
      ).rows,
    ).toEqual(
      [...customer.permissions].sort((a, b) =>
        a.permissionKey.localeCompare(b.permissionKey),
      ),
    );
  });

  it("keeps explicit denials, reasons, invalid fail-closed restrictions, and prerequisite behavior", async () => {
    const id = await user(
      [
        await role("custom", [
          { permissionKey: "scooters.read", scopes: ["ALL"] },
          { permissionKey: "scooter_documents.read", scopes: ["ALL"] },
          { permissionKey: "persons.read", scopes: ["ALL"] },
          { permissionKey: "persons.create", scopes: ["ALL"] },
        ]),
      ],
      [
        {
          permissionKey: "scooters.read",
          scopes: [],
          reason: "Explicit denial",
        },
        {
          permissionKey: "persons.read",
          scopes: ["OWN"],
          reason: "Corrupt restriction stays denied",
        },
      ],
    );
    const before = await authority(id);
    const overrides = (
      await db.query(
        'SELECT * FROM "UserPermissionOverride" WHERE "userId"=$1 ORDER BY "permissionKey"',
        [id],
      )
    ).rows;
    await db.query(migration);
    expect(await authority(id)).toEqual(before);
    expect(
      (
        await db.query(
          'SELECT * FROM "UserPermissionOverride" WHERE "userId"=$1 AND "permissionKey" IN (\'scooters.read\',\'persons.read\') ORDER BY "permissionKey"',
          [id],
        )
      ).rows,
    ).toEqual(overrides);
  });

  it("does not assign or revise roleless accounts and preserves login and super-admin flags", async () => {
    const ids = [
      await user([], [], { status: "DISABLED" }),
      await user([], [], { superAdmin: true }),
      await user([await role("old", [])], [], {
        status: "SUSPENDED",
        deleted: true,
      }),
    ];
    const before = (
      await db.query<{
        id: string;
        loginStatus: string;
        isSuperAdmin: boolean;
        deletedAt: Date | null;
        accessRevision: number;
      }>(
        'SELECT id,"loginStatus","isSuperAdmin","deletedAt","accessRevision" FROM "User" ORDER BY id',
      )
    ).rows;
    await db.query(migration);
    const after = (
      await db.query<{
        id: string;
        loginStatus: string;
        isSuperAdmin: boolean;
        deletedAt: Date | null;
        accessRevision: number;
      }>(
        'SELECT id,"loginStatus","isSuperAdmin","deletedAt","accessRevision" FROM "User" ORDER BY id',
      )
    ).rows;
    expect(after).toEqual(
      before.map((row) => ({
        ...row,
        accessRevision: row.accessRevision + (row.id === ids[2] ? 1 : 0),
      })),
    );
    expect(await baseRole(ids[0])).toEqual([]);
    expect(await baseRole(ids[1])).toEqual([]);
  });

  it("does not restore grants from archived roles, including an archived canonical preset", async () => {
    const id = await user([
      await role(
        "mechanic",
        initialRoles.find((r) => r.slug === "mechanic")!.permissions,
        true,
      ),
    ]);
    const before = await authority(id);
    await db.query(migration);
    expect(await baseRole(id)).toEqual([]);
    expect(await authority(id)).toEqual(before);
  });

  it("reruns leave later access decisions and revision counters unchanged", async () => {
    const id = await user([await role("old", [])]);
    await db.query(migration);
    await db.query('DELETE FROM "UserRole" WHERE "userId"=$1', [id]);
    await db.query(
      'UPDATE "User" SET "loginStatus"=\'SUSPENDED\',"accessRevision"=23 WHERE id=$1',
      [id],
    );
    const before = (
      await db.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"')
    ).rows;
    await db.query(migration);
    expect(await baseRole(id)).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT "loginStatus","accessRevision" FROM "User" WHERE id=$1',
          [id],
        )
      ).rows[0],
    ).toEqual({ loginStatus: "SUSPENDED", accessRevision: 23 });
    expect(
      (await db.query<{ count: string }>('SELECT count(*) FROM "AuditEvent"'))
        .rows,
    ).toEqual(before);
  });

  it("rolls all access writes back if required auditing fails", async () => {
    const id = await user([await role("old", [])]);
    await db.query(
      `CREATE FUNCTION pg_temp.reject_fixed_role_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${marker}' THEN RAISE EXCEPTION 'required audit unavailable'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      'CREATE TRIGGER reject_fixed_role_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_fixed_role_audit()',
    );
    await db.query("SAVEPOINT before_migration");
    await expect(db.query(migration)).rejects.toThrow(
      "required audit unavailable",
    );
    await db.query("ROLLBACK TO SAVEPOINT before_migration");
    expect(await baseRole(id)).toEqual(["old"]);
    expect(
      (await db.query<{ count: string }>('SELECT count(*) FROM "Role"')).rows[0]
        .count,
    ).toBe("1");
    expect(
      (
        await db.query<{ count: string }>(
          'SELECT count(*) FROM "UserPermissionOverride"',
        )
      ).rows[0].count,
    ).toBe("0");
  });
});
