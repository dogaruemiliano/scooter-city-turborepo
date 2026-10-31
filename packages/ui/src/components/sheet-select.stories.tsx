import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SheetSelect } from "./sheet-select";

const meta = {
  title: "Components/SheetSelect",
  component: SheetSelect,
} satisfies Meta<typeof SheetSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

function SearchOnlyExample() {
  const [value, setValue] = useState("");
  return (
    <SheetSelect
      label="Scooter"
      value={value}
      onValueChange={setValue}
      placeholder="Select scooter"
      searchPlaceholder="Search scooters"
      options={[
        { value: "ready", label: "007 HON · Ready" },
        {
          value: "blocked",
          label: "008 HON · No insurance · Held for service",
          disabled: true,
          searchOnly: true,
        },
      ]}
    />
  );
}
/** Searching reveals unavailable rows with their explanation, without allowing selection. */
export const SearchOnlyUnavailableOptions: Story = {
  args: { label: "Scooter", options: [], value: "", onValueChange: () => {} },
  render: () => <SearchOnlyExample />,
};

/** Small pickers can omit search without changing selection behavior. */
export const WithoutSearch: Story = {
  args: {
    label: "Assignees",
    options: [
      { value: "ada", label: "Ada Lovelace" },
      { value: "grace", label: "Grace Hopper" },
    ],
    value: "",
    onValueChange: () => {},
    searchable: false,
  },
};
