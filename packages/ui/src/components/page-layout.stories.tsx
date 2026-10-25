import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "./button";
import { FormActions } from "./form-actions";
import { FormSection } from "./form-section";
import { Input } from "./input";
import { Label } from "./label";
import { PageLayout } from "./page-layout";
import { WizardForm } from "./wizard-form";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

const meta = {
  title: "Patterns/Page layout",
  component: PageLayout,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    width: { control: "select", options: ["standard", "form", "full"] },
    paddingX: { control: "select", options: ["default", "none"] },
    paddingTop: { control: "select", options: ["default", "compact", "none"] },
  },
} satisfies Meta<typeof PageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

function Content() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Pages share a centered content boundary and responsive gutters.
        </p>
      </header>
      <FormSection title="Details">
        <div className="grid gap-2">
          <Label htmlFor="layout-name">Name</Label>
          <Input id="layout-name" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="layout-reference">Reference</Label>
          <Input id="layout-reference" />
        </div>
      </FormSection>
    </>
  );
}

export const Standard: Story = {
  render: (args) => (
    <PageLayout {...args}>
      <Content />
    </PageLayout>
  ),
};

/** SidebarInset uses div because PageLayout supplies the single main landmark. */
export const WithNavigation: Story = {
  render: (args) => (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent className="p-4 text-sm">App navigation</SidebarContent>
      </Sidebar>
      <SidebarInset as="div">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-8">
          <SidebarTrigger />
          <span className="text-sm font-semibold">Workspace</span>
        </header>
        <PageLayout {...args}>
          <Content />
        </PageLayout>
      </SidebarInset>
    </SidebarProvider>
  ),
};

export const NarrowForm: Story = {
  args: { width: "form" },
  render: Standard.render,
};

export const FullWidth: Story = {
  args: { width: "full" },
  render: Standard.render,
};

export const EdgeToEdge: Story = {
  args: { paddingX: "none", paddingTop: "none" },
  render: (args) => (
    <PageLayout {...args}>
      <div className="bg-muted p-6 text-muted-foreground">
        Editors may own their spacing without changing the page boundary.
      </div>
    </PageLayout>
  ),
};

function WizardExample() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [name, setName] = useState("");
  return (
    <PageLayout paddingX="none" paddingTop="compact">
      <WizardForm
        activeIndex={activeIndex}
        onStepChange={setActiveIndex}
        onSubmit={(event) => event.preventDefault()}
        progressLabel="Form progress"
        steps={[
          {
            id: "details",
            label: "Details",
            content: (
              <div className="grid gap-2">
                <Label htmlFor="wizard-layout-name">Name</Label>
                <Input
                  id="wizard-layout-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            ),
          },
          {
            id: "review",
            label: "Review",
            content: <p className="text-sm">{name || "No name entered"}</p>,
          },
        ]}
        footer={
          <FormActions>
            <Button
              type="button"
              variant="outline"
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex(0)}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={activeIndex === 1}
              onClick={() => setActiveIndex(1)}
            >
              Review
            </Button>
          </FormActions>
        }
      />
    </PageLayout>
  );
}

/** Wizard gutters align with the standard page; swipe panels remain edge-to-edge. */
export const Wizard: Story = { render: () => <WizardExample /> };

export const Mobile: Story = {
  ...Wizard,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Dark: Story = {
  render: (args) => (
    <div data-theme="dark" className="min-h-dvh bg-background text-foreground">
      <PageLayout {...args}>
        <Content />
      </PageLayout>
    </div>
  ),
};
