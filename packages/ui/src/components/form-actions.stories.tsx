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
