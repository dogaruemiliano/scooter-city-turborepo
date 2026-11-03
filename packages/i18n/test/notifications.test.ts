import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNotificationMessage,
  formatNotificationMessageParts,
} from "../src";

test("structured notification copy preserves the sentence and treats names as literal values", () => {
  for (const locale of ["en", "ro"]) {
    const input = {
      type: "issue.commented",
      actorName: "Maria {subject}",
      subjectLabel: "Maria <b>repair</b>",
    };
    const parts = formatNotificationMessageParts(locale, input);
    assert.equal(
      parts.map((part) => part.text).join(""),
      formatNotificationMessage(locale, input).body,
    );
    assert.deepEqual(
      parts.filter((part) => part.kind !== "text").map((part) => part.text),
      [input.actorName, input.subjectLabel],
    );
  }
  assert.deepEqual(
    formatNotificationMessageParts("en", {
      type: "issue.assigned",
      reason: "unassigned",
      actorName: "Private",
      subjectLabel: "Private task",
    }),
    [{ kind: "text", text: "A job was removed from your assignments." }],
  );
});

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
