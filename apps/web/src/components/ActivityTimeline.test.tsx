import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { CircleCheck } from "lucide-react";
import {
  ActivityTimeline,
  ActivityTimelineItem,
} from "@repo/ui/components/activity-timeline";
describe("activity timeline", () => {
  it("keeps history collapsed until requested and exposes change details", async () => {
    const user = userEvent.setup();
    render(
      <ActivityTimeline title="Activity" count={1} summary="Task completed">
        <ol>
          <ActivityTimelineItem
            icon={<CircleCheck />}
            tone="success"
            title="Resolved the problem"
            actor="Alex"
            timestamp="Today"
            dateTime="2026-10-24T11:00:00Z"
            detailsLabel="View changes"
            details="Replaced pads"
          >
            In progress → Resolved
          </ActivityTimelineItem>
        </ol>
      </ActivityTimeline>,
    );
    const trigger = screen.getByRole("button", { name: /Activity/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Resolved the problem")).toBeVisible();
    await user.click(screen.getByText("View changes"));
    expect(screen.getByText("Replaced pads")).toBeVisible();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
