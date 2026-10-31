import assert from "node:assert/strict";
import { test } from "node:test";
import { v1 } from "../src";

test("task sections validate buy lists and saved or one-off locations", () => {
  const valid = {
    revision: 1,
    sections: ["buyList", "location"],
    buyList: [{ id: "tire", text: "Rear tire", completed: false }],
    location: {
      name: "Workshop",
      address: "10 Main Street",
      savedLocationId: null,
    },
  };
  assert.equal(
    v1.problems.updateProblemInputSchema.safeParse(valid).success,
    true,
  );
  for (const input of [
    { ...valid, sections: ["buyList", "buyList"] },
    { ...valid, sections: ["unknown"] },
    { ...valid, buyList: [...valid.buyList, ...valid.buyList] },
    { ...valid, buyList: [{ id: "tire", text: " ", completed: false }] },
    { ...valid, location: { name: "Workshop", address: " " } },
  ])
    assert.equal(
      v1.problems.updateProblemInputSchema.safeParse(input).success,
      false,
    );
});

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

test("report requires title and repair difficulty, with optional description and photos", () => {
  const valid = {
    scooterId: "scooter",
    title: "Broken belt",
    difficulty: "hard",
  };
  assert.deepEqual(v1.problems.createProblemInputSchema.parse(valid), {
    ...valid,
    description: "",
    blocksUsage: false,
    photos: [],
  });
  for (const bad of [
    { ...valid, title: " " },
    { ...valid, difficulty: "urgent" },
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
    difficulty: "hard",
    status: "resolved",
    scooterId: "scooter",
    assigneeId: "member",
  });
  assert.equal(filter.blocking, false);
  assert.equal(filter.unassigned, false);
  assert.equal(filter.difficulty, "hard");
});

test("creation accepts and validates optional task sections", () => {
  const base = { scooterId: "scooter", title: "Service", difficulty: "easy" };
  const sections = {
    sections: ["checklist", "buyList", "location"],
    checklist: [{ id: "check", text: "Check brakes", completed: false }],
    buyList: [{ id: "pads", text: "Brake pads", completed: false }],
    location: {
      name: "Pickup",
      address: "10 Main Street",
      savedLocationId: null,
    },
  };
  const parsed = v1.problems.createProblemInputSchema.parse({
    ...base,
    ...sections,
  });
  for (const key of ["sections", "checklist", "buyList", "location"] as const)
    assert.deepEqual(parsed[key], sections[key]);
  for (const invalid of [
    { sections: ["unknown"] },
    { sections: ["location", "location"] },
    { checklist: [{ id: "check", text: " ", completed: false }] },
    { buyList: [...sections.buyList, ...sections.buyList] },
    { location: { name: "Pickup", address: " " } },
  ])
    assert.equal(
      v1.problems.createProblemInputSchema.safeParse({ ...base, ...invalid })
        .success,
      false,
    );
});

test("problem filters accept multiple assignees with optional unassigned work", () => {
  const parsed = v1.problems.listProblemsQuerySchema.parse({
    assigneeIds: "mechanic-a,mechanic-b",
    unassigned: "true",
  });
  assert.deepEqual(parsed.assigneeIds, ["mechanic-a", "mechanic-b"]);
  assert.equal(parsed.unassigned, true);
  assert.equal(
    v1.problems.listProblemsQuerySchema.safeParse({ assigneeIds: "" }).success,
    false,
  );
  assert.equal(
    v1.problems.listProblemsQuerySchema.safeParse({ assigneeIds: "a,,b" })
      .success,
    false,
  );
  assert.equal(
    v1.problems.listProblemsQuerySchema.safeParse({
      assigneeIds: Array.from({ length: 101 }, (_, i) => String(i)).join(","),
    }).success,
    false,
  );
  assert.equal(
    v1.problems.listProblemsQuerySchema.parse({ assigneeId: "legacy" })
      .assigneeId,
    "legacy",
  );
});

test("assignments accept multiple unique users, clearing, and legacy requests", () => {
  const create = {
    scooterId: "scooter",
    title: "Shared work",
    difficulty: "easy",
  };
  assert.deepEqual(
    v1.problems.createProblemInputSchema.parse({
      ...create,
      assigneeIds: ["a", "b"],
    }).assigneeIds,
    ["a", "b"],
  );
  assert.deepEqual(
    v1.problems.assignProblemInputSchema.parse({ revision: 1, assigneeIds: [] })
      .assigneeIds,
    [],
  );
  assert.equal(
    v1.problems.assignProblemInputSchema.parse({ revision: 1, assigneeId: "a" })
      .assigneeId,
    "a",
  );
  for (const invalid of [
    { assigneeIds: ["a", "a"] },
    { assigneeIds: [""] },
    { assigneeIds: ["a"], assigneeId: "b" },
    { assigneeIds: Array.from({ length: 101 }, (_, i) => String(i)) },
  ]) {
    assert.equal(
      v1.problems.createProblemInputSchema.safeParse({ ...create, ...invalid })
        .success,
      false,
    );
    assert.equal(
      v1.problems.assignProblemInputSchema.safeParse({
        revision: 1,
        ...invalid,
      }).success,
      false,
    );
  }
  assert.equal(
    v1.problems.assignProblemInputSchema.safeParse({ revision: 1 }).success,
    false,
  );
  assert.equal(
    v1.problems.updateProblemInputSchema.safeParse({
      revision: 1,
      assigneeIds: ["a"],
    }).success,
    true,
  );
});

test("difficulty has three levels and historical severity remains readable without conversion", () => {
  assert.deepEqual(v1.problems.problemDifficultySchema.options, [
    "easy",
    "medium",
    "hard",
  ]);
  for (const difficulty of ["easy", "medium", "hard"]) {
    assert.equal(
      v1.problems.createProblemInputSchema.safeParse({
        scooterId: "scooter",
        title: "Repair",
        difficulty,
      }).success,
      true,
    );
  }
  for (const difficulty of [
    "low",
    "moderate",
    "high",
    "critical",
    "unknown",
    null,
  ]) {
    assert.equal(
      v1.problems.problemDifficultySchema.safeParse(difficulty).success,
      false,
    );
  }
  const state = v1.problems.problemActivityStateSchema.parse({
    severity: "critical",
  });
  assert.equal(state.severity, "critical");
  assert.equal(state.difficulty, undefined);
  assert.deepEqual(
    v1.problems.problemActivityStateSchema.parse({ difficulty: "easy" }),
    { difficulty: "easy" },
  );
});

test("work transitions accept start or pause and reject contradictory actions", () => {
  for (const transition of [{ startWork: true }, { pauseWork: true }]) {
    assert.equal(
      v1.problems.updateProblemInputSchema.safeParse({
        revision: 1,
        ...transition,
      }).success,
      true,
    );
  }
  assert.equal(
    v1.problems.updateProblemInputSchema.safeParse({
      revision: 1,
      startWork: true,
      pauseWork: true,
    }).success,
    false,
  );
});

test("todos explicitly omit the scooter while keeping required task fields", () => {
  const todo = { scooterId: null, title: "Order supplies" };
  assert.equal(
    v1.problems.createProblemInputSchema.safeParse({
      ...todo,
      scooterId: "scooter",
    }).success,
    false,
  );
  assert.equal(
    v1.problems.createProblemInputSchema.parse(todo).scooterId,
    null,
  );
  assert.equal(
    v1.problems.createProblemInputSchema.safeParse({
      title: "Missing scooter identity",
      difficulty: "easy",
    }).success,
    false,
  );
  assert.equal(
    v1.problems.createProblemInputSchema.safeParse({ ...todo, title: " " })
      .success,
    false,
  );
  assert.equal(
    v1.problems.listProblemsQuerySchema.parse({ kind: "todo" }).kind,
    "todo",
  );
  assert.equal(
    v1.problems.listProblemsQuerySchema.safeParse({ kind: "other" }).success,
    false,
  );
});

test("full edits accept assignment and condition changes without creation fields", () => {
  const input = {
    revision: 2,
    title: "Edited issue",
    assigneeIds: ["admin"],
    blocksUsage: false,
  };
  assert.deepEqual(v1.problems.updateProblemInputSchema.parse(input), input);
  assert.equal(
    v1.problems.updateProblemInputSchema.safeParse({
      ...input,
      assigneeIds: ["admin", "admin"],
    }).success,
    false,
  );
});
