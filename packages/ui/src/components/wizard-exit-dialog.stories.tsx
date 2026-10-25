import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WizardExitDialog } from "./wizard-exit-dialog";
import { Button } from "./button";
import { SaveButton } from "./save-button";

const meta = {
  title: "Forms/WizardExitDialog",
  component: WizardExitDialog,
  args: {
    open: true,
    onOpenChange: () => {},
    title: "Leave person creation?",
    description: "Entered details and uploaded documents will be lost.",
    actions: null,
  },
  tags: ["autodocs"],
} satisfies Meta<typeof WizardExitDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
function Example({ draft = false }: { draft?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Leave wizard</Button>
      <WizardExitDialog
        open={open}
        onOpenChange={setOpen}
        title={draft ? "Leave rental creation?" : "Discard unsaved changes?"}
        description={
          draft
            ? "Save this draft to continue later, or discard it."
            : "All entered details and uploaded documents will be lost."
        }
        actions={
          <>
            {draft ? (
              <SaveButton
                type="button"
                variant="destructive"
                idleLabel="Delete draft"
                pendingLabel="Deleting…"
                successLabel="Draft deleted"
                onClick={() => setOpen(false)}
              />
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Keep editing
              </Button>
            )}
            <SaveButton
              type="button"
              variant={draft ? "default" : "destructive"}
              idleLabel={draft ? "Save draft" : "Discard changes"}
              pendingLabel={draft ? "Saving…" : "Discarding…"}
              successLabel={draft ? "Draft saved" : "Changes discarded"}
              onClick={() => setOpen(false)}
            />
          </>
        }
      />
    </>
  );
}
export const Person: Story = { render: () => <Example /> };
export const Rental: Story = { render: () => <Example draft /> };
