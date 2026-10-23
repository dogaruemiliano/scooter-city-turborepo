import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  ToastProvider,
  useToast,
  type ToastPosition,
  type ToastVariant,
} from "./toast";
import { motion } from "@repo/theme";

type PlaygroundProps = {
  variant: ToastVariant;
  surface: "floating" | "solid";
  position: ToastPosition;
  title: string;
  description: string;
  timeout: number;
  theme: "light" | "dark";
  withAction: boolean;
};
function Controls({
  variant,
  title,
  description,
  timeout,
  withAction,
}: PlaygroundProps) {
  const toast = useToast();
  const notify = () =>
    toast.add({
      title,
      description,
      variant,
      timeout,
      ...(withAction
        ? {
            actionProps: {
              children: "Undo",
              onClick: () =>
                toast.add({ title: "Change undone", variant: "info" }),
            },
          }
        : {}),
    });
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={notify}>Show notification</Button>
      <Button
        variant="outline"
        onClick={() => {
          for (const variant of ["success", "info", "warning"] as const)
            toast.add({
              title: `${variant}: work updated`,
              description,
              variant,
            });
        }}
      >
        Show stack
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          const id = toast.add({
            id: "work-save",
            title: "Saving work…",
            variant: "loading",
          });
          window.setTimeout(
            () =>
              toast.update(id, {
                title: "Work saved",
                variant: "success",
                timeout: motion.duration.toastDismiss,
              }),
            motion.duration.documentReviewPause,
          );
        }}
      >
        Loading → success
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          void toast
            .promise(
              new Promise((_, reject) =>
                window.setTimeout(
                  () => reject(new Error("Connection interrupted")),
                  motion.duration.documentReviewPause,
                ),
              ),
              {
                loading: { title: "Saving work…" },
                success: { title: "Work saved" },
                error: {
                  title: "Work could not be saved",
                  description: "Check your connection and try again.",
                },
              },
            )
            .catch(() => {});
        }}
      >
        Loading → error
      </Button>
      <Button variant="ghost" onClick={() => toast.dismiss()}>
        Dismiss all
      </Button>
    </div>
  );
}
function Playground(props: PlaygroundProps) {
  useEffect(() => {
    const previous = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", props.theme);
    return () => {
      if (previous)
        document.documentElement.setAttribute("data-theme", previous);
      else document.documentElement.removeAttribute("data-theme");
    };
  }, [props.theme]);
  return (
    <ToastProvider
      position={props.position}
      surface={props.surface}
      timeout={props.timeout}
    >
      <main className="flex min-h-screen flex-col gap-6 bg-background p-6 pt-32 text-foreground">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Toast playground</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Show a notification, then change the controls to inspect its
            surface, placement, and content. Error and loading notifications
            remain visible unless a timeout is supplied.
          </p>
        </div>
        <Controls {...props} />
        <section className="flex flex-wrap gap-4" aria-label="Surface backdrop">
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-2xl bg-primary p-6 text-primary-foreground">
            <span className="text-2xl font-semibold">Service workspace</span>
          </div>
          <div className="flex min-h-64 flex-1 items-center justify-center rounded-2xl bg-info-subtle p-6 text-info">
            <span className="text-2xl font-semibold">Fleet updates</span>
          </div>
        </section>
        <p className="text-sm text-muted-foreground">
          Keyboard: F6 to reach notifications. Hover or focus pauses dismissal.
          Swipe to dismiss. Use Storybook’s viewport controls to inspect mobile
          sizing.
        </p>
      </main>
    </ToastProvider>
  );
}
const meta = {
  title: "Feedback/Toast",
  component: Playground,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    variant: "success",
    surface: "floating",
    position: "top-center",
    title: "Work started",
    description: "You can pause this task from more actions.",
    timeout: 0,
    theme: "light",
    withAction: false,
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["neutral", "success", "info", "warning", "error", "loading"],
    },
    surface: { control: "inline-radio", options: ["floating", "solid"] },
    position: {
      control: "select",
      options: [
        "top-start",
        "top-center",
        "top-end",
        "bottom-start",
        "bottom-center",
        "bottom-end",
      ],
    },
    theme: { control: "inline-radio", options: ["light", "dark"] },
    timeout: { control: "number" },
  },
} satisfies Meta<typeof Playground>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PlaygroundStory: Story = { name: "Playground" };
export const Dark: Story = { args: { theme: "dark" } };
export const WithUndo: Story = {
  args: { withAction: true, title: "Assignment changed" },
};
export const PersistentError: Story = {
  args: {
    variant: "error",
    title: "Work could not be saved",
    description:
      "Your changes are still on this page. Check your connection and try again.",
  },
};
export const LongContent: Story = {
  args: {
    title: "The repair has been saved and is ready for inspection",
    description:
      "The checklist, work notes, photos, and all assigned members have been preserved. A supervisor can now inspect the scooter before clearing its usage hold.",
    withAction: true,
  },
};
export const AutoDismiss: Story = {
  args: { timeout: motion.duration.toastDismiss },
};
export const BottomEnd: Story = { args: { position: "bottom-end" } };
export const Solid: Story = { args: { surface: "solid" } };
