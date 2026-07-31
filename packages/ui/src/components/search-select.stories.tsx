import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { tokens } from "@repo/theme";
import { Building2Icon, MapPinIcon, UserIcon } from "lucide-react";

import { Label } from "@repo/ui/components/label";
import {
  SearchSelect,
  type SearchSelectOption,
} from "@repo/ui/components/search-select";

const cityOptions = [
  {
    value: "bucharest",
    label: "Bucharest",
    description: "Romania · 42 active scooters",
    icon: MapPinIcon,
  },
  {
    value: "cluj-napoca",
    label: "Cluj-Napoca",
    description: "Romania · 18 active scooters",
    icon: MapPinIcon,
  },
  {
    value: "iasi",
    label: "Iași",
    description: "Romania · 12 active scooters",
    icon: MapPinIcon,
  },
  {
    value: "timisoara",
    label: "Timișoara",
    description: "Romania · 16 active scooters",
    icon: MapPinIcon,
  },
  {
    value: "brasov",
    label: "Brașov",
    description: "Romania · Temporarily unavailable",
    disabled: true,
    icon: MapPinIcon,
  },
] satisfies SearchSelectOption[];

const meta = {
  title: "Shadcn/SearchSelect",
  component: SearchSelect,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
  args: {
    options: cityOptions,
    ariaLabel: "City",
    placeholder: "Choose a city",
    searchPlaceholder: "Search cities",
  },
} satisfies Meta<typeof SearchSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelection: Story = {
  args: {
    defaultValue: "cluj-napoca",
  },
};

export const Controlled: Story = {
  render: (args) => <ControlledSearchSelect {...args} />,
};

export const Disabled: Story = {
  args: {
    defaultValue: "iasi",
    disabled: true,
  },
};

export const ServerResults: Story = {
  render: (args) => <ServerSearchSelect {...args} />,
};

const counterpartyOptions = [
  {
    value: "person-1",
    label: "Alex Ionescu",
    description: "Person · alex@example.com · 0722 123 456",
    icon: UserIcon,
  },
  {
    value: "company-1",
    label: "Acme Logistics SRL",
    description: "Company · RO12345678",
    icon: Building2Icon,
  },
] satisfies SearchSelectOption[];

function ServerSearchSelect(props: React.ComponentProps<typeof SearchSelect>) {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    const timeout = window.setTimeout(
      () => setLoading(false),
      tokens.motion.duration.slow,
    );

    return () => window.clearTimeout(timeout);
  }, [query]);

  const options = counterpartyOptions.filter((option) =>
    `${option.label} ${option.description}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );

  return (
    <SearchSelect
      {...props}
      options={options}
      serverSearch
      loading={loading}
      onSearchQueryChange={setQuery}
      hasMore
      onLoadMore={() => undefined}
      placeholder="Choose a counterparty"
      searchPlaceholder="Search people and companies"
    />
  );
}

function ControlledSearchSelect(
  props: React.ComponentProps<typeof SearchSelect>,
) {
  const [value, setValue] = React.useState<string | null>("bucharest");

  return (
    <div className="flex flex-col gap-2">
      <Label>Service city</Label>
      <SearchSelect {...props} value={value} onValueChange={setValue} />
      <p className="text-xs text-muted-foreground">
        Selected: {value ?? "None"}
      </p>
    </div>
  );
}
