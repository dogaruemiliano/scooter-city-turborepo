import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  SearchField,
  type SearchFieldProps,
} from "@repo/ui/components/search-field";

const meta = {
  title: "Shadcn/SearchField",
  component: SearchField,
  tags: ["autodocs"],
  args: { label: "Search records", placeholder: "Search by name or email" },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
// Storybook's inferred args cannot represent mutually dependent clear props.
// The clearable story supplies those props together in its render function.
type Story = StoryObj<Omit<SearchFieldProps, "onClear" | "clearLabel">>;

export const Default: Story = { args: meta.args };

export const Clearable: Story = {
  args: meta.args,
  render: function ClearableSearch(args) {
    const [value, setValue] = useState("Alex");
    return (
      <SearchField
        {...args}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClear={() => setValue("")}
        clearLabel="Clear search"
      />
    );
  },
};

export const Disabled: Story = {
  args: { ...meta.args, disabled: true, defaultValue: "Alex" },
};

export const InsideForm: Story = {
  args: meta.args,
  render: (args) => (
    <form onSubmit={(event) => event.preventDefault()}>
      <SearchField {...args} name="query" />
    </form>
  ),
};
