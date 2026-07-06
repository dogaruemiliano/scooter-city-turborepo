import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivityIcon, ClipboardListIcon, UserRoundIcon } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

const meta = {
  title: "Shadcn/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        Patient summary, demographic details, and key care metrics.
      </TabsContent>
      <TabsContent value="activity">
        Appointment history and recent care team events.
      </TabsContent>
      <TabsContent value="notes">
        Clinical notes and private remarks.
      </TabsContent>
    </Tabs>
  ),
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="profile">
      <TabsList variant="line">
        <TabsTrigger value="profile">
          <UserRoundIcon data-icon="inline-start" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="tasks">
          <ClipboardListIcon data-icon="inline-start" />
          Tasks
        </TabsTrigger>
        <TabsTrigger value="activity">
          <ActivityIcon data-icon="inline-start" />
          Activity
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile">Profile fields and preferences.</TabsContent>
      <TabsContent value="tasks">
        Open tasks assigned to the care team.
      </TabsContent>
      <TabsContent value="activity">Timeline of recent updates.</TabsContent>
    </Tabs>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Tabs defaultValue="profile" orientation="vertical" className="flex-row">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        Profile configuration appears here.
      </TabsContent>
      <TabsContent value="billing">
        Billing configuration appears here.
      </TabsContent>
      <TabsContent value="security">
        Security configuration appears here.
      </TabsContent>
    </Tabs>
  ),
};
