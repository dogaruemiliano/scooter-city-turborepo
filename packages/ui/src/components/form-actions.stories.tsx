import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { FormActions } from "@repo/ui/components/form-actions";

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

/** The page owns additional end-of-form clearance; the sticky card owns its inset. */
export const StickyCard: Story = {
  render: () => (
    <form className="grid min-w-0 gap-8 px-4 pb-16 sm:px-8 sm:pb-24">
      <div className="min-h-dvh">
        <p className="text-sm text-muted-foreground">
          Scroll to see the action card float above the screen edge and settle
          with extra space below it at the end of the form.
        </p>
      </div>
      <FormActions sticky status="Review the required details before saving.">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="button">Save details and finish</Button>
      </FormActions>
    </form>
  ),
};

/** Toggle readiness/pending in Controls to preview the shared page-form states. */
export const RevealWhenReady: Story = {
  parameters: { layout: "fullscreen" },
  args: { ready: true, pending: false, status: "Ready to submit." },
  render: (args) => (
    <form className="flex min-h-dvh flex-col gap-6 p-4">
      <p className="flex-1 text-sm text-muted-foreground">Form content</p>
      <FormActions {...args}>
        <Button type="button" variant="outline" disabled={args.pending}>
          Cancel
        </Button>
        <Button type="button" disabled={!args.ready || args.pending}>
          {args.pending ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
  ),
};
