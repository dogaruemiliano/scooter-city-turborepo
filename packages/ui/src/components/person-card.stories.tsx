import type { Meta, StoryObj } from "@storybook/react-vite";
import { PersonCard, PersonDocuments } from "./person-card";

const meta = {
  title: "Components/PersonCard",
  component: PersonCard,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    name: "Ada Lovelace",
    description: "+40 712 345 678",
    email: "ada@example.com",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-screen-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonCard>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Document badges sit beneath the avatar, alongside the identity text. */
export const VerifiedDocuments: Story = {
  args: {
    details: (
      <PersonDocuments
        documents={[
          {
            type: "identity",
            label: "Identity document: Valid",
            state: "valid",
          },
          {
            type: "driverLicense",
            label: "Driving license: Valid",
            state: "valid",
          },
        ]}
      />
    ),
  },
};
export const MissingAndExpired: Story = {
  args: {
    details: (
      <PersonDocuments
        documents={[
          {
            type: "identity",
            label: "Identity document: Not present",
            state: "missing",
          },
          {
            type: "driverLicense",
            label: "Driving license: Expired",
            state: "expired",
          },
        ]}
      />
    ),
  },
};
export const UnverifiedAndRejected: Story = {
  args: {
    details: (
      <PersonDocuments
        documents={[
          {
            type: "identity",
            label: "Identity document: Unverified",
            state: "unverified",
          },
          {
            type: "driverLicense",
            label: "Driving license: Rejected",
            state: "rejected",
          },
        ]}
      />
    ),
  },
};
export const ListMetadata: Story = {
  args: { ...VerifiedDocuments.args, metadata: "Oct 24, 2026" },
};
export const LongIdentity: Story = {
  args: {
    ...VerifiedDocuments.args,
    name: "Alexandru Constantin Popescu Ionescu",
    email: "alexandru.constantin.popescu.ionescu@example.com",
  },
};
