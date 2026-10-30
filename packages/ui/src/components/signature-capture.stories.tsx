import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignatureCapture } from "./signature-capture";

const meta = {
  title: "Components/SignatureCapture",
  component: SignatureCapture,
  tags: ["autodocs"],
  args: {
    label: "Your signature",
    hint: "Draw with a finger or mouse. Keyboard: Space starts or ends a stroke; arrow keys draw; Escape ends the stroke.",
    clearLabel: "Clear signature",
    onChange: () => {},
  },
} satisfies Meta<typeof SignatureCapture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
