import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { FormActions } from "./form-actions";
import { SaveButton } from "./save-button";

const meta = {
  title: "Layout/KeyboardAwareScrollView",
  component: KeyboardAwareScrollView,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "On a phone, opening the software keyboard constrains the existing scroll viewport. The browser owns native focus scrolling; this component never forces the page or the focused field to scroll. Content spacing stays unchanged. Floating form actions return to normal flow while typing so they do not cover the field. Dismissing the keyboard restores the normal viewport and floating actions without resetting scroll position. Native software keyboards require an actual mobile browser or Simulator.",
      },
    },
  },
} satisfies Meta<typeof KeyboardAwareScrollView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Form: Story = {
  render: () => (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border p-4 text-base font-semibold">
        Task details
      </header>
      <KeyboardAwareScrollView className="flex-1">
        <div className="mx-auto flex w-full max-w-(--container-form-columns) flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="keyboard-title">Title</Label>
            <Input id="keyboard-title" defaultValue="Inspect the rear brake" />
          </div>
          {Array.from({ length: 8 }, (_, index) => (
            <p key={index} className="text-sm text-muted-foreground">
              Inspection detail {index + 1}: check the scooter before returning
              it to service.
            </p>
          ))}
          <div className="flex flex-col gap-2">
            <Label htmlFor="keyboard-comment">Comment</Label>
            <Textarea
              id="keyboard-comment"
              placeholder="Add inspection details"
            />
          </div>
          <section className="border-t border-border pt-6">
            <h2 className="text-base font-semibold">Activity</h2>
            <p className="text-sm text-muted-foreground">Inspection created.</p>
          </section>
          <FormActions ready>
            <SaveButton
              type="button"
              idleLabel="Complete task"
              pendingLabel="Completing task…"
              successLabel="Task completed"
            />
          </FormActions>
        </div>
      </KeyboardAwareScrollView>
    </div>
  ),
};
