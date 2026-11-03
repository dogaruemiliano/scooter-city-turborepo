import assert from "node:assert/strict";
import test from "node:test";
import { formatNotificationMessage } from "../src";

test("notification messages use the same localized sentence for inbox and push", () => {
  const input = {
    type: "scooter.updated",
    actorName: "Maria",
    subjectLabel: "007 HON",
    actorIsSystem: false,
  };
  assert.deepEqual(formatNotificationMessage("en", input), {
    title: "ScooterCity",
    body: "Maria updated scooter 007 HON.",
  });
  assert.equal(
    formatNotificationMessage("ro", input).body,
    "Maria a actualizat scuterul 007 HON.",
  );
});

test("unnamed staff and system actors remain distinct", () => {
  const input = {
    type: "issue.commented",
    actorName: "",
    subjectLabel: "Brake repair",
  };
  assert.equal(
    formatNotificationMessage("en", input).body,
    "A team member commented on Brake repair.",
  );
  assert.equal(
    formatNotificationMessage("en", { ...input, actorIsSystem: true }).body,
    "ScooterCity commented on Brake repair.",
  );
  assert.equal(
    formatNotificationMessage("ro", input).body,
    "Un membru al echipei a comentat la Brake repair.",
  );
});

test("removed-assignment messages do not expose the previous task or actor", () => {
  const message = formatNotificationMessage("en", {
    type: "issue.assigned",
    actorName: "Private actor",
    subjectLabel: "Private task",
    reason: "unassigned",
  });
  assert.equal(message.body, "A job was removed from your assignments.");
});

test("unknown future events have a localized fallback without raw event keys", () => {
  assert.equal(
    formatNotificationMessage("ro", {
      type: "future.action",
      actorName: "Maria",
      subjectLabel: "",
      subjectType: "issue",
    }).body,
    "Maria a modificat o problemă.",
  );
});
