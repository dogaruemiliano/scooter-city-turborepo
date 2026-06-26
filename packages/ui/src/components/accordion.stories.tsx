import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/accordion";

const meta = {
  title: "Shadcn/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion defaultValue={["intake"]}>
      <AccordionItem value="intake">
        <AccordionTrigger>Patient intake</AccordionTrigger>
        <AccordionContent>
          Capture demographics, contact details, and the initial appointment
          reason before the visit begins.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="insurance">
        <AccordionTrigger>Insurance verification</AccordionTrigger>
        <AccordionContent>
          Verify payer details and attach supporting documents to the patient
          profile.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="follow-up">
        <AccordionTrigger>Follow-up cadence</AccordionTrigger>
        <AccordionContent>
          Set a review interval and assign the next care team owner.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const MultipleOpen: Story = {
  render: () => (
    <Accordion defaultValue={["intake", "follow-up"]} multiple>
      <AccordionItem value="intake">
        <AccordionTrigger>Open intake checklist</AccordionTrigger>
        <AccordionContent>
          Multiple sections can remain expanded for checklist-style workflows.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="documents">
        <AccordionTrigger>Collect documents</AccordionTrigger>
        <AccordionContent>
          Use this pattern when users need to compare several sections at once.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="follow-up">
        <AccordionTrigger>Schedule follow-up</AccordionTrigger>
        <AccordionContent>
          The panel animation uses shared motion tokens from the theme.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const DisabledItem: Story = {
  render: () => (
    <Accordion>
      <AccordionItem value="active">
        <AccordionTrigger>Available section</AccordionTrigger>
        <AccordionContent>
          This item can be opened and focused normally.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="locked">
        <AccordionTrigger disabled>Locked until review</AccordionTrigger>
        <AccordionContent>
          This content remains unavailable while the trigger is disabled.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
