import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FilePlus,
  Users,
  Play,
  Pause,
  CircleCheck,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { ActivityTimeline, ActivityTimelineItem } from "./activity-timeline";
const meta = {
  title: "Patterns/Activity timeline",
  component: ActivityTimeline,
  args: {
    title: "Activity",
    count: 7,
    summary: "Task completed · Today, 14:30",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-(--container-form-columns) p-4">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ActivityTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;
const events = [
  { title: "Task completed", icon: CircleCheck, tone: "success" },
  { title: "Safety hold cleared", icon: ShieldCheck, tone: "success" },
  { title: "Work paused", icon: Pause, tone: "warning" },
  { title: "Work started", icon: Play, tone: "info" },
  { title: "Changed assignment", icon: Users, tone: "info" },
  { title: "Safety hold applied", icon: ShieldAlert, tone: "destructive" },
  { title: "Reported the problem", icon: FilePlus, tone: "neutral" },
] as const;
function Events() {
  return (
    <ol>
      {events.map((event, index) => (
        <ActivityTimelineItem
          key={event.title}
          title={event.title}
          tone={event.tone}
          icon={<event.icon />}
          actor={index % 2 ? "Maria Popescu" : "Alex Morgan"}
          timestamp="Today, 14:30"
          dateTime="2026-10-24T11:30:00Z"
          detailsLabel="View changes"
          details={
            index === 0
              ? "Replaced brake pads and completed the road test. No further issues found."
              : undefined
          }
        >
          {index === 0
            ? "In progress → Resolved"
            : index === 4
              ? "Maria Popescu → Alex Morgan"
              : undefined}
        </ActivityTimelineItem>
      ))}
    </ol>
  );
}
export const Collapsed: Story = { args: { children: <Events /> } };
export const Expanded: Story = {
  args: { defaultOpen: true, children: <Events /> },
};
export const Empty: Story = {
  args: {
    count: 0,
    summary: undefined,
    defaultOpen: true,
    children: <p className="text-sm text-muted-foreground">No activity yet.</p>,
  },
};
export const Loading: Story = {
  args: {
    count: undefined,
    summary: undefined,
    defaultOpen: true,
    children: (
      <p role="status" className="text-sm text-muted-foreground">
        Loading activity…
      </p>
    ),
  },
};
export const Error: Story = {
  args: {
    count: undefined,
    summary: undefined,
    defaultOpen: true,
    children: (
      <p role="alert" className="text-sm text-destructive">
        Activity could not be loaded.
      </p>
    ),
  },
};
export const Mobile: Story = {
  ...Expanded,
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
};
export const Dark: Story = {
  ...Expanded,
  decorators: [
    (Story) => (
      <div className="dark bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
};
