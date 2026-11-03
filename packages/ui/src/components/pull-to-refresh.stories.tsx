import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./button";
import { PullToRefresh } from "./pull-to-refresh";

const meta = {
  title: "Shadcn/PullToRefresh",
  component: PullToRefresh,
  tags: ["autodocs"],
  args: {
    refreshing: false,
    onRefresh: () => {},
    labels: {
      pull: "Pull to refresh",
      release: "Release to refresh",
      refreshing: "Refreshing…",
      refresh: "Refresh page data",
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Use a mobile viewport (below the shared md breakpoint). Only a pull or the keyboard refresh action opens the indicator; initial loads, navigation and background refetches never open it or move existing content. The refreshing prop reports request activity and prevents duplicate requests. The content pulls down to reveal an anchored, continuously spinning indicator. It spins from the first revealed portion through the request and the return animation. After an explicit refresh, the reveal stays open while refreshing; content slides back over the spinner only after the request settles. Short or cancelled pulls also slide closed. Reduced motion preferences are respected. Render directly inside the existing scrollport. The request owns refreshing; errors remain beside the content. A keyboard-focusable refresh action provides a gesture alternative. Nested scroll areas, editable controls, horizontal swipes, multi-touch, and cancelled gestures are ignored. Add data-pull-to-refresh-ignore to other gesture owners.",
      },
    },
  },
} satisfies Meta<typeof PullToRefresh>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: function Demo(args) {
    const [refreshing, setRefreshing] = useState(false);
    const [updates, setUpdates] = useState(0);
    const [error, setError] = useState(false);
    return (
      <div className="h-96 overflow-y-auto overscroll-y-contain rounded-xl border border-border bg-background">
        <PullToRefresh
          {...args}
          refreshing={refreshing}
          onRefresh={() => {
            setError(false);
            setRefreshing(true);
          }}
        >
          <div className="flex flex-col gap-4 p-6">
            <h2 className="text-base font-semibold">
              Fleet updates: {updates}
            </h2>
            <p className="text-sm text-muted-foreground">
              Pull down at the top and pause to check the spinning indicator.
              Release, then complete or fail the request to watch the content
              slide back over it. Short content can refresh too.
            </p>
            {refreshing ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    setUpdates((value) => value + 1);
                    setRefreshing(false);
                  }}
                >
                  Complete request
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(true);
                    setRefreshing(false);
                  }}
                >
                  Fail request
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setError(false);
                  setRefreshing(true);
                }}
              >
                Refetch in background
              </Button>
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                Unable to refresh. Pull again to retry.
              </p>
            ) : null}
          </div>
        </PullToRefresh>
      </div>
    );
  },
};

export const BackgroundLoading: Story = {
  args: { refreshing: true },
  render: (args) => (
    <div className="h-96 overflow-y-auto overscroll-y-contain bg-background">
      <PullToRefresh {...args}>
        <p className="p-6 text-sm">
          Existing content stays visible while background data loads, with no
          pull-to-refresh indicator.
        </p>
      </PullToRefresh>
    </div>
  ),
};

export const Disabled: Story = {
  ...BackgroundLoading,
  args: { disabled: true, refreshing: false },
};
