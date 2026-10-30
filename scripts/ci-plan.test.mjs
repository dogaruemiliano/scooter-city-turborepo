import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checks, createPlan, readWorkspace } from "./ci-plan.mjs";

const workspace = readWorkspace();
const ids = (plan) => plan.matrix.include.map((check) => check.id);
const webChecks = [
  "web-unit-1",
  "web-unit-2",
  "web-unit-3",
  "web-unit-4",
  "web-build",
];

test("web-only changes run all web shards and static checks without backend jobs", () => {
  const plan = createPlan(["apps/web/src/app/page.tsx"], workspace);
  assert.deepEqual(ids(plan), ["lint", "types", ...webChecks]);
  assert.equal(plan.e2e, false);
});

test("API changes run units and database E2E without web jobs", () => {
  const plan = createPlan(
    ["apps/api/src/scooters/scooters.service.ts"],
    workspace,
  );
  assert.deepEqual(ids(plan), ["lint", "types", "unit"]);
  assert.equal(plan.e2e, true);
});

for (const pkg of ["api-shared", "i18n", "theme"]) {
  test(`${pkg} changes reach all consumers, including web and database E2E`, () => {
    const plan = createPlan([`packages/${pkg}/src/index.ts`], workspace);
    assert.deepEqual(
      ids(plan),
      checks.map((check) => check.id),
    );
    assert.equal(plan.e2e, true);
  });
}

test("native-only changes require static verification", () => {
  const plan = createPlan(
    ["packages/ui-native/src/DecButton/index.tsx"],
    workspace,
  );
  assert.deepEqual(ids(plan), ["lint", "types"]);
  assert.equal(plan.e2e, false);
});

test("UI source guards run the theme tests without unrelated database tests", () => {
  for (const filename of ["bottom-sheet.tsx", "sheet-select.tsx"]) {
    const plan = createPlan(
      [`packages/ui/src/components/${filename}`],
      workspace,
    );
    assert.deepEqual(ids(plan), ["lint", "types", "unit", ...webChecks]);
    assert.equal(plan.e2e, false);
  }
});

test("moves between packages select both owners", () => {
  const plan = createPlan(
    ["apps/web/src/moved.ts", "apps/api/src/moved.ts"],
    workspace,
  );
  assert.deepEqual(
    ids(plan),
    checks.map((check) => check.id),
  );
  assert.equal(plan.e2e, true);
});

test("tooling, package metadata, and unknown paths require full verification", () => {
  for (const filename of [
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
    ".github/workflows/ci.yml",
    "scripts/ci-plan.mjs",
    "AGENTS.md",
    "apps/web/AGENTS.md",
    "apps/web/package.json",
    "apps/new-app/src/index.ts",
  ]) {
    const plan = createPlan([filename], workspace);
    assert.deepEqual(
      ids(plan),
      checks.map((check) => check.id),
      filename,
    );
    assert.equal(plan.e2e, true, filename);
  }
});

test("main and manual runs always request full verification", () => {
  const plan = createPlan([], workspace, true);
  assert.deepEqual(
    ids(plan),
    checks.map((check) => check.id),
  );
  assert.equal(plan.e2e, true);
});

test("documentation-only and empty diffs need no workspace or database jobs", () => {
  for (const paths of [[], ["README.md", "docs/developer-guide.md"]]) {
    assert.deepEqual(createPlan(paths, workspace), {
      matrix: { include: [] },
      e2e: false,
    });
  }
});

test("every web shard uses a unique cache namespace and covers one of four parts", () => {
  const shards = checks.filter((check) => check.id.startsWith("web-unit-"));
  assert.equal(shards.length, 4);
  assert.equal(new Set(checks.map((check) => check.id)).size, checks.length);
  shards.forEach((shard, index) =>
    assert.ok(shard.command.endsWith(`--shard=${index + 1}/4`)),
  );
  for (const shard of shards)
    assert.ok(shard.command.includes("--maxWorkers=75%"));
});

test("the required workflow check permits only successful or intentionally skipped jobs", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const guard = workflow
    .slice(workflow.lastIndexOf("        run: |") + "        run: |".length)
    .replace(/^ {10}/gm, "");
  assert.match(guard, /PLAN_RESULT/);
  const scenarios = [
    ["success", "true", "true", "success", "success", true],
    ["success", "true", "false", "success", "skipped", true],
    ["success", "false", "false", "skipped", "skipped", true],
    ["success", "true", "true", "failure", "success", false],
    ["success", "true", "true", "success", "failure", false],
    ["success", "true", "true", "cancelled", "success", false],
    ["success", "true", "true", "success", "skipped", false],
    ["success", "true", "false", "skipped", "skipped", false],
    ["success", "false", "false", "success", "skipped", false],
    ["failure", "false", "false", "skipped", "skipped", false],
    ["cancelled", "", "", "skipped", "skipped", false],
  ];
  for (const [
    plan,
    checksRequired,
    e2eRequired,
    checksResult,
    e2e,
    passes,
  ] of scenarios) {
    const result = spawnSync("bash", ["-e", "-c", guard], {
      env: {
        ...process.env,
        PLAN_RESULT: plan,
        CHECKS_REQUIRED: checksRequired,
        E2E_REQUIRED: e2eRequired,
        CHECKS_RESULT: checksResult,
        E2E_RESULT: e2e,
      },
    });
    assert.equal(
      result.status === 0,
      passes,
      JSON.stringify({ plan, checksRequired, e2eRequired, checksResult, e2e }),
    );
  }
});
