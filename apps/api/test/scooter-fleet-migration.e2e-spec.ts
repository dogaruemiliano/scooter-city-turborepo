import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const migration = readFileSync(
  join(
    __dirname,
    "../prisma/migrations/20261011110000_scooter_fleet_numbers/migration.sql",
  ),
  "utf8",
);

describe("Fleet-number migration (isolated PostgreSQL schema)", () => {
  let client: Client;
  let schema: string;

  beforeEach(async () => {
    schema = `fleet_test_${randomUUID().replaceAll("-", "")}`;
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";
      CREATE TABLE "ScooterBrand" (id text PRIMARY KEY, code text);
      CREATE TABLE "Scooter" (id text PRIMARY KEY, "brandId" text, "createdAt" timestamp DEFAULT now(), "deletedAt" timestamp);
      CREATE TABLE "ScooterDocument" ("scooterId" text, "fileName" text, "deletedAt" timestamp);
      INSERT INTO "ScooterBrand" VALUES ('iva', 'IVA'), ('kym', 'KYM'), ('agm', 'AGM');`);
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });

  it("preserves legacy numbers, includes deleted records, and assigns remaining numbers deterministically", async () => {
    await client.query(`
      INSERT INTO "Scooter" (id, "brandId", "createdAt", "deletedAt") VALUES
        ('a', 'iva', '2026-01-01', NULL), ('b', 'kym', '2026-01-01', NULL),
        ('c', 'agm', '2026-02-01', NULL), ('d', 'iva', '2026-03-01', now());
      INSERT INTO "ScooterDocument" VALUES
        ('c', 'CIV-004-AGM.pdf', NULL), ('c', 'asigurare-004-AGM.pdf', NULL),
        ('c', 'CIV-005-AGM.pdf', now()), ('a', 'CIV-009-AGM.pdf', NULL);
    `);
    await client.query(migration);
    expect(
      (
        await client.query(
          'SELECT id, "fleetNumber" FROM "Scooter" ORDER BY id',
        )
      ).rows,
    ).toEqual([
      { id: "a", fleetNumber: 1 },
      { id: "b", fleetNumber: 2 },
      { id: "c", fleetNumber: 4 },
      { id: "d", fleetNumber: 3 },
    ]);
    expect(
      (await client.query('SELECT "lastNumber" FROM "ScooterFleetCounter"'))
        .rows,
    ).toEqual([{ lastNumber: 4 }]);
    await expect(
      client.query('UPDATE "Scooter" SET "fleetNumber" = 9 WHERE id = \'a\''),
    ).rejects.toThrow("cannot be changed");
    await expect(
      client.query(
        'INSERT INTO "Scooter" (id, "fleetNumber") VALUES (\'duplicate\', 1)',
      ),
    ).rejects.toThrow("unique");
  });

  it("starts an empty fleet at 001 and rolls back failed allocations", async () => {
    await client.query(migration);
    await client.query("BEGIN");
    expect(
      (
        await client.query(
          'UPDATE "ScooterFleetCounter" SET "lastNumber" = "lastNumber" + 1 RETURNING "lastNumber"',
        )
      ).rows[0],
    ).toEqual({ lastNumber: 1 });
    await client.query("ROLLBACK");
    expect(
      (await client.query('SELECT "lastNumber" FROM "ScooterFleetCounter"'))
        .rows[0],
    ).toEqual({ lastNumber: 0 });
  });

  it("continues after the highest legacy number beyond three digits", async () => {
    await client.query(`INSERT INTO "Scooter" (id, "brandId") VALUES ('a', 'agm');
      INSERT INTO "ScooterDocument" VALUES ('a', 'cert-999-AGM.pdf', NULL);`);
    await client.query(migration);
    expect(
      (
        await client.query(
          'UPDATE "ScooterFleetCounter" SET "lastNumber" = "lastNumber" + 1 RETURNING "lastNumber"',
        )
      ).rows[0],
    ).toEqual({ lastNumber: 1000 });
  });

  it.each([
    [
      "two scooters claiming the same number",
      "('a', 'CIV-004-AGM.pdf', NULL), ('b', 'CIV-004-IVA.pdf', NULL)",
    ],
    [
      "conflicting numbers on one scooter",
      "('a', 'CIV-004-AGM.pdf', NULL), ('a', 'cert-005-AGM.pdf', NULL)",
    ],
    ["zero as a legacy number", "('a', 'CIV-000-AGM.pdf', NULL)"],
  ])("refuses %s without partially migrating", async (_label, documents) => {
    await client.query(`INSERT INTO "Scooter" (id, "brandId") VALUES ('a', 'agm'), ('b', 'iva');
      INSERT INTO "ScooterDocument" VALUES ${documents};`);
    await expect(client.query(migration)).rejects.toThrow("Conflicting legacy");
    await client.query("ROLLBACK");
    expect(
      (await client.query('SELECT * FROM "Scooter" LIMIT 1')).rows[0],
    ).not.toHaveProperty("fleetNumber");
  });
});
