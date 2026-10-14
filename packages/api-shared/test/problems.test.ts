import assert from "node:assert/strict";
import { test } from "node:test";
import { v1 } from "../src";

test("checklists reject duplicate IDs, empty text and excessive items", () => {
  const item = { id: "pads", text: "Install pads", completed: false };
  assert.equal(
    v1.problems.updateProblemInputSchema.safeParse({
      revision: 1,
      checklist: [item],
    }).success,
    true,
  );
  for (const checklist of [
    [item, item],
    [{ ...item, text: " " }],
    Array.from({ length: 51 }, (_, i) => ({ ...item, id: String(i) })),
  ]) {
    assert.equal(
      v1.problems.updateProblemInputSchema.safeParse({ revision: 1, checklist })
        .success,
      false,
    );
  }
});

test("report requires title and impact severity, with optional description and photos", () => {
  const valid = {
    scooterId: "scooter",
    title: "Broken belt",
    severity: "critical",
  };
  assert.deepEqual(v1.problems.createProblemInputSchema.parse(valid), {
    ...valid,
    description: "",
    blocksUsage: false,
    photos: [],
  });
  for (const bad of [
    { ...valid, title: " " },
    { ...valid, severity: "urgent" },
    { scooterId: "scooter", description: "Broken belt" },
  ])
    assert.equal(
      v1.problems.createProblemInputSchema.safeParse(bad).success,
      false,
    );
});
test("resolution and comments reject empty content and arbitrary state fields", () => {
  assert.equal(
    v1.problems.resolveProblemInputSchema.safeParse({
      revision: 1,
      resolutionNotes: " ",
    }).success,
    false,
  );
  assert.equal(
    v1.problems.problemCommentInputSchema.safeParse({ revision: 1, body: " " })
      .success,
    false,
  );
  assert.equal(
    v1.problems.problemHoldInputSchema.safeParse({
      revision: 1,
      blocksUsage: false,
      status: "resolved",
    }).success,
    false,
  );
  assert.equal(
    v1.problems.resolveProblemInputSchema.parse({
      revision: 1,
      resolutionNotes: "Fixed",
      clearMaintenanceHold: false,
    }).clearMaintenanceHold,
    false,
  );
});
test("hold filtering parses false accurately and supports all release filters", () => {
  const filter = v1.problems.listProblemsQuerySchema.parse({
    blocking: "false",
    unassigned: "false",
    severity: "critical",
    status: "resolved",
    scooterId: "scooter",
    assigneeId: "member",
  });
  assert.equal(filter.blocking, false);
  assert.equal(filter.unassigned, false);
  assert.equal(filter.severity, "critical");
});
