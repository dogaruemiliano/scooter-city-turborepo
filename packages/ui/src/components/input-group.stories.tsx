import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  InputGroup,
  InputGroupInput,
  InputGroupSelectTrigger,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from "@repo/ui/components/select";
import { Separator } from "@repo/ui/components/separator";

const meta = {
  title: "Shadcn/InputGroup",
  component: InputGroup,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Currency: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="amount">Amount</Label>
      <InputGroup>
        <InputGroupInput id="amount" inputMode="decimal" defaultValue="125" />
        <Separator orientation="vertical" />
        <Select defaultValue="RON">
          <InputGroupSelectTrigger aria-label="Currency">
            <SelectValue />
          </InputGroupSelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="RON">RON</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </InputGroup>
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput aria-invalid defaultValue="invalid" />
      <Separator orientation="vertical" />
      <Select defaultValue="RON">
        <InputGroupSelectTrigger aria-label="Currency" aria-invalid>
          <SelectValue />
        </InputGroupSelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="RON">RON</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </InputGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput disabled value="125" readOnly />
      <Separator orientation="vertical" />
      <Select defaultValue="RON" disabled>
        <InputGroupSelectTrigger aria-label="Currency">
          <SelectValue />
        </InputGroupSelectTrigger>
      </Select>
    </InputGroup>
  ),
};
