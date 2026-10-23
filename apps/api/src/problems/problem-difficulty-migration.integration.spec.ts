import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Only run against an explicitly named local disposable database.
const databaseUrl = process.env.ACCESS_DOMAIN_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("Problem difficulty migration", () => {
  it("maps every old severity while preserving original rows and enforcing three levels", async () => {
    const url = new URL(databaseUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.startsWith("/scooter_access_test_")
    )
      throw new Error(
        "Use an explicitly named local disposable access-test database",
      );
    const client = new Client({ connectionString: databaseUrl });
    const schema = `difficulty_${randomUUID().replaceAll("-", "")}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`CREATE TABLE "ScooterProblem" (
        id TEXT PRIMARY KEY, severity TEXT, status TEXT, "blocksUsage" BOOLEAN,
        description TEXT, "resolutionNotes" TEXT, "assigneeId" TEXT, revision INTEGER,
        "updatedAt" TIMESTAMP, checklist JSONB
      )`);
      const severities = ["low", "moderate", "high", "critical", null];
      for (const [index, severity] of severities.entries()) {
        await client.query(
          `INSERT INTO "ScooterProblem" VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            String(index),
            severity,
            index % 2 ? "resolved" : "open",
            index === 3,
            "Original description",
            "Original resolution",
            "worker",
            7,
            "2026-10-14T12:00:00Z",
            JSON.stringify([{ id: "check", text: "Inspect", done: true }]),
          ],
        );
      }
      const original = (
        await client.query('SELECT * FROM "ScooterProblem" ORDER BY id')
      ).rows;
      await client.query(
        readFileSync(
          "prisma/migrations/20261024120000_problem_difficulty/migration.sql",
          "utf8",
        ),
      );
      const migrated = (
        await client.query('SELECT * FROM "ScooterProblem" ORDER BY id')
      ).rows;
      expect(
        migrated.map((row: { difficulty: string | null }) => row.difficulty),
      ).toEqual(["easy", "medium", "hard", "hard", null]);
      expect(
        migrated.map(
          ({ difficulty, ...row }: { difficulty: string | null }) => {
            void difficulty;
            return row;
          },
        ),
      ).toEqual(original);
      for (const value of [
        "low",
        "moderate",
        "high",
        "critical",
        "urgent",
        "unknown",
      ]) {
        await expect(
          client.query(
            'UPDATE "ScooterProblem" SET difficulty = $1 WHERE id = $2',
            [value, "0"],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      }
      // Future assessments do not overwrite the retained original severity.
      await client.query(
        'UPDATE "ScooterProblem" SET difficulty = $1 WHERE id = $2',
        ["easy", "3"],
      );
      expect(
        (
          await client.query(
            'SELECT severity, difficulty FROM "ScooterProblem" WHERE id = $1',
            ["3"],
          )
        ).rows,
      ).toEqual([{ severity: "critical", difficulty: "easy" }]);
    } finally {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
