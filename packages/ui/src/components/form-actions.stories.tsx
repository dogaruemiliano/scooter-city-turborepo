import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { FormActions } from "@repo/ui/components/form-actions";
import { PageLayout } from "@repo/ui/components/page-layout";
import { SaveButton } from "@repo/ui/components/save-button";

const meta = {
  title: "Forms/FormActions",
  component: FormActions,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-(--breakpoint-md)">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <FormActions>
      <Button variant="secondary">Cancel</Button>
      <Button>Save changes</Button>
    </FormActions>
  ),
};

export const WithStatus: Story = {
  render: () => (
    <FormActions status="You have unsaved changes.">
      <Button variant="secondary">Cancel</Button>
      <Button>Review changes</Button>
    </FormActions>
  ),
};

/** Floating page actions keep only the primary action on mobile. */
export const SplitWithStatus: Story = {
  args: {
    arrangement: "split",
    ready: true,
    status: "Funding details are ready for review.",
  },
  render: (args) => (
    <FormActions
      {...args}
      secondaryAction={
        <Button type="button" variant="outline">
          Cancel
        </Button>
      }
    >
      <SaveButton
        type="button"
        idleLabel="Record funding"
        pendingLabel="Recording funding…"
        successLabel="Funding recorded"
      />
    </FormActions>
  ),
};

export const RaisedSurface: Story = {
  render: () => (
    <Card surface="raised" className="pb-0">
      <CardContent>
        <p>Changes are ready for review.</p>
      </CardContent>
      <FormActions status="Review before saving.">
        <Button variant="secondary">Cancel</Button>
        <Button>Review changes</Button>
      </FormActions>
    </Card>
  ),
};

/** Floating clearance uses the larger of the normal edge gap and the device safe area. */
export const StickyCard: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The floating card uses max(spacing-4, safe-area-inset-bottom), preserving the normal browser gap without adding it on top of the iPhone home-indicator inset. Page-end padding matches the app shell.",
      },
    },
  },
  render: () => (
    <form className="grid min-w-0 gap-8 px-4 pb-[calc(var(--spacing-screen-bottom)+env(safe-area-inset-bottom))] sm:px-8">
      <div className="min-h-dvh">
        <p className="text-sm text-muted-foreground">
          Scroll to see the action card float above the screen edge while
          respecting the device safe area.
        </p>
      </div>
      <FormActions
        sticky
        status="Review the required details before saving."
        secondaryAction={
          <Button type="button" variant="outline">
            Cancel
          </Button>
        }
      >
        <Button type="button">Save details and finish</Button>
      </FormActions>
    </form>
  ),
};

/** Mirrors the mobile app shell: the scrollport itself must not have bottom padding. */
export const StickyInPageScroll: Story = {
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story:
          "Bottom safe-area padding belongs to the scrolling content, not the scrollport. Putting it on the scrollport adds it to the sticky card's bottom offset and raises the actions twice on iOS.",
      },
    },
  },
  args: { ready: true, pending: false },
  render: (args) => (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-[calc(var(--spacing-16)+env(safe-area-inset-top))] shrink-0 items-center border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)]">
        Page header
      </header>
      <div
        data-slot="app-page-scroll"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain"
      >
        <div
          data-slot="app-page-content"
          className="flex min-w-0 flex-1 flex-col pb-[calc(var(--spacing-screen-bottom)+env(safe-area-inset-bottom))]"
        >
          <PageLayout>
            <form className="grid min-w-0 gap-8">
              <Card className="min-h-dvh">
                <CardContent>
                  Scroll to check that the actions stay near the screen edge and
                  the final fields remain reachable.
                </CardContent>
              </Card>
              <FormActions
                {...args}
                secondaryAction={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={args.pending}
                  >
                    Cancel
                  </Button>
                }
              >
                <SaveButton
                  type="button"
                  state={args.pending ? "pending" : "idle"}
                  disabled={!args.ready}
                  idleLabel="Save changes"
                  pendingLabel="Saving changes…"
                  successLabel="Changes saved"
                />
              </FormActions>
            </form>
          </PageLayout>
        </div>
      </div>
    </div>
  ),
};

/** Toggle readiness/pending in Controls to preview the shared page-form states. */
export const RevealWhenReady: Story = {
  parameters: { layout: "fullscreen" },
  args: { ready: true, pending: false, status: "Ready to submit." },
  render: (args) => (
    <form className="flex min-h-dvh flex-col gap-6 p-4">
      <p className="flex-1 text-sm text-muted-foreground">Form content</p>
      <FormActions
        {...args}
        secondaryAction={
          <Button type="button" variant="outline" disabled={args.pending}>
            Cancel
          </Button>
        }
      >
        <Button type="button" disabled={!args.ready || args.pending}>
          {args.pending ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
  ),
};

/** Compact action bars retain touch targets while reducing padding and gaps. */
export const CompactSaveBar: Story = {
  render: () => (
    <FormActions
      density="compact"
      ready
      secondaryAction={
        <Button type="button" variant="text">
          Cancel
        </Button>
      }
    >
      <SaveButton
        type="button"
        idleLabel="Save changes"
        pendingLabel="Saving…"
        successLabel="Changes saved"
      />
    </FormActions>
  ),
};

/** Use the mobile header to leave; desktop retains Cancel beside the primary action. */
export const MobilePrimaryAction: Story = {
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { ready: true },
  render: (args) => (
    <FormActions
      {...args}
      status="Changes are ready to save."
      secondaryAction={
        <Button type="button" variant="outline">
          Cancel
        </Button>
      }
    >
      <SaveButton
        type="button"
        state={args.pending ? "pending" : "idle"}
        idleLabel="Create"
        pendingLabel="Creating…"
        successLabel="Created"
      />
    </FormActions>
  ),
};

export const LongPrimaryLabel: Story = {
  parameters: { layout: "fullscreen" },
  args: { ready: true },
  render: (args) => (
    <FormActions
      {...args}
      secondaryAction={
        <Button type="button" variant="outline">
          Anulează
        </Button>
      }
    >
      <SaveButton
        type="button"
        state={args.pending ? "pending" : "idle"}
        idleLabel="Salvează modificările responsabililor și continuă la confirmare"
        pendingLabel="Se salvează modificările responsabililor…"
        successLabel="Modificările au fost salvate"
      />
    </FormActions>
  ),
};
