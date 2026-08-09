import type { Meta, StoryObj } from "@storybook/react-vite";

import { FormSection } from "@repo/ui/components/form-section";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

const meta = {
  title: "Shadcn/FormSection",
  component: FormSection,
  tags: ["autodocs"],
} satisfies Meta<typeof FormSection>;

export default meta;
type Story = StoryObj<typeof meta>;

function TextField({ label, id }: { label: string; id: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} />
    </div>
  );
}

export const Single: Story = {
  args: { title: "Identity" },
  render: (args) => (
    <div className="max-w-screen-lg">
      <FormSection {...args}>
        <TextField id="legal-name" label="Legal name" />
        <TextField id="trading-name" label="Trading name" />
      </FormSection>
    </div>
  ),
};

export const Stacked: Story = {
  args: { title: "Identity" },
  render: () => (
    <form className="grid max-w-screen-lg gap-8">
      <FormSection title="Identity">
        <TextField id="stacked-legal-name" label="Legal name" />
        <TextField id="stacked-trading-name" label="Trading name" />
      </FormSection>
      <FormSection title="Contact">
        <TextField id="stacked-email" label="Email" />
        <TextField id="stacked-phone" label="Phone" />
      </FormSection>
      <FormSection>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="stacked-notes">Notes</Label>
          <Textarea id="stacked-notes" />
        </div>
      </FormSection>
    </form>
  ),
};

/**
 * A single-field section drops its title: a heading above one labelled input
 * repeats the label for no benefit.
 */
export const Untitled: Story = {
  render: () => (
    <div className="max-w-screen-lg">
      <FormSection>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="untitled-notes">Notes</Label>
          <Textarea id="untitled-notes" />
        </div>
      </FormSection>
    </div>
  ),
};

/** A child spanning both columns, as address and notes fields usually do. */
export const FullWidthChild: Story = {
  args: { title: "Address" },
  render: (args) => (
    <div className="max-w-screen-lg">
      <FormSection {...args}>
        <TextField id="city" label="City" />
        <TextField id="postal-code" label="Postal code" />
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="address-line-1">Address line 1</Label>
          <Input id="address-line-1" />
        </div>
      </FormSection>
    </div>
  ),
};
