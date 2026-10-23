import { Button } from "./button";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CommentThread,
  CommentItem,
  CommentEventItem,
  CommentComposer,
} from "./comments";
import type { SaveButtonState } from "./save-button";

const meta = {
  title: "Patterns/Comments",
  component: CommentThread,
  args: { title: "Comments" },
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-(--container-form-columns) p-4">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof CommentThread>;
export default meta;
type Story = StoryObj<typeof meta>;

const initialComments = [
  {
    author: "Alex Morgan",
    dateTime: "2026-10-24T09:15:00Z",
    timestamp: "Today, 12:15",
    body: "The rear brake pads are worn. I’ve ordered a replacement set and will check the brake fluid before fitting them.",
  },
  {
    author: "Maria Popescu",
    dateTime: "2026-10-24T10:40:00Z",
    timestamp: "Today, 13:40",
    body: "Parts arrived at the workshop.\nPlease leave the old pads with the inspection notes.",
  },
];
const labels = {
  idleLabel: "Add comment",
  pendingLabel: "Adding comment…",
  successLabel: "Comment added",
};

function Conversation({
  empty = false,
  readOnly = false,
  state = "idle",
  error,
  long = false,
  disabled = false,
  withRecovery = false,
  expanded = false,
}: {
  empty?: boolean;
  readOnly?: boolean;
  state?: SaveButtonState;
  error?: string;
  long?: boolean;
  disabled?: boolean;
  withRecovery?: boolean;
  expanded?: boolean;
}) {
  const [newCommentIndex, setNewCommentIndex] = useState<number | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [comments, setComments] = useState(empty ? [] : initialComments);
  const [draft, setDraft] = useState(
    expanded
      ? "Checked the brake pads.\nReplacement parts arrived.\nBrake fluid checked.\nFitting is complete.\nFinal inspection pending.\nRoad test is next.\nLeave the inspection notes at the workshop."
      : state === "idle" || state === "success"
        ? ""
        : "The brake fluid has been checked. Ready for the final inspection.",
  );
  return (
    <CommentThread
      title="Comments"
      empty="No comments yet. Add the first update below."
      composer={
        readOnly ? undefined : (
          <CommentComposer
            disabled={disabled || (withRecovery && !recovered)}
            label="Comment"
            placeholder="Add an update or relevant details"
            maxLength={4000}
            value={draft}
            onValueChange={setDraft}
            error={recovered ? undefined : error}
            recovery={
              withRecovery && !recovered ? (
                <Button
                  className="self-start"
                  variant="outline"
                  onClick={() => setRecovered(true)}
                >
                  Reload
                </Button>
              ) : undefined
            }
            submitButton={{ ...labels, state }}
            onSubmit={(event) => {
              event.preventDefault();
              setNewCommentIndex(comments.length);
              setComments((current) => [
                ...current,
                {
                  author: "Alex Morgan",
                  dateTime: "2026-10-24T11:00:00Z",
                  timestamp: "Just now",
                  body: draft.trim(),
                },
              ]);
              setDraft("");
            }}
          />
        )
      }
    >
      {comments.length ? (
        <ol className="flex flex-col gap-6">
          {comments.map((comment, index) => (
            <CommentItem
              key={index}
              animateEntrance={index === newCommentIndex}
              onAnimationEnd={() => setNewCommentIndex(null)}
              author={
                long ? "Alexandru Constantin Popescu Ionescu" : comment.author
              }
              dateTime={comment.dateTime}
              timestamp={comment.timestamp}
            >
              {long
                ? `${comment.body}\n\nInspection reference: ${"workshop-reference-".repeat(12)}`
                : comment.body}
            </CommentItem>
          ))}
        </ol>
      ) : undefined}
    </CommentThread>
  );
}

export const ConversationThread: Story = { render: () => <Conversation /> };
export const Empty: Story = { render: () => <Conversation empty /> };
export const ReadOnly: Story = { render: () => <Conversation readOnly /> };
export const Pending: Story = {
  render: () => <Conversation state="pending" />,
};
export const Failed: Story = {
  render: () => (
    <Conversation
      state="error"
      error="The comment could not be added. Your draft is still here. Check your connection and submit again."
    />
  ),
};
export const LongContent: Story = { render: () => <Conversation long /> };
export const Mobile: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-sm">
      <Conversation />
    </div>
  ),
};

export const Success: Story = {
  render: () => <Conversation state="success" />,
};
export const Disabled: Story = { render: () => <Conversation disabled /> };
export const Dark: Story = {
  render: () => (
    <div className="dark bg-background p-6 text-foreground">
      <Conversation />
    </div>
  ),
};

export const Recovery: Story = {
  render: () => (
    <Conversation
      state="error"
      withRecovery
      error="This record changed. Reload it and review your comment before posting."
    />
  ),
};

export const NewCommentAnimation: Story = {
  render: () => <Conversation />,
  parameters: {
    docs: {
      description: {
        story:
          "Post a comment to preview its fade and upward entrance. Existing comments stay still; reduced motion disables the animation.",
      },
    },
  },
};

export const ExpandedComposer: Story = {
  render: () => <Conversation expanded />,
};

export const TaskTransitions: Story = {
  render: () => (
    <CommentThread title="Comments">
      <ol className="flex flex-col gap-4">
        <CommentEventItem
          kind="completed"
          label="Task completed"
          author="Alex Morgan"
          dateTime="2026-10-24T11:00:00Z"
          timestamp="Today, 14:00"
        >
          Replaced the brake pads and completed the road test.
        </CommentEventItem>
        <CommentItem
          author="Maria Popescu"
          dateTime="2026-10-24T12:00:00Z"
          timestamp="Today, 15:00"
        >
          The rider reported a noise on the next trip.
        </CommentItem>
        <CommentEventItem
          kind="reopened"
          label="Task reopened"
          author="Maria Popescu"
          dateTime="2026-10-24T12:05:00Z"
          timestamp="Today, 15:05"
        >
          Please inspect the rear wheel bearing before returning the scooter to
          service.
        </CommentEventItem>
      </ol>
    </CommentThread>
  ),
};
