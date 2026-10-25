import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Field, FieldDescription, FieldLabel } from "./field";
import { FormActions } from "./form-actions";
import { Input } from "./input";
import { SaveButton } from "./save-button";
import { SheetSelect } from "./sheet-select";
import { Textarea } from "./textarea";
import { WizardForm } from "./wizard-form";

const meta = {
  title: "Forms/WizardForm",
  component: WizardForm,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    steps: [],
    activeIndex: 0,
    progressLabel: "Booking progress",
    onStepChange: () => {},
  },
} satisfies Meta<typeof WizardForm>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({
  validation = false,
  hideHeadingOnMobile = false,
  picker = false,
  disabled = false,
  dir = "ltr",
}: {
  validation?: boolean;
  hideHeadingOnMobile?: boolean;
  picker?: boolean;
  disabled?: boolean;
  dir?: "ltr" | "rtl";
}) {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [complete, setComplete] = useState(false);
  const canGoNext = index !== 0 || !validation || Boolean(name.trim());
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col py-6">
      <WizardForm
        activeIndex={index}
        onStepChange={setIndex}
        canGoNext={canGoNext}
        disabled={disabled}
        dir={dir}
        progressLabel="Booking progress"
        hideHeadingOnMobile={hideHeadingOnMobile}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !canGoNext) return;
          if (index < 2) setIndex(index + 1);
          else setComplete(true);
        }}
        steps={[
          {
            id: "details",
            label: "Details",
            content: (
              <>
                <p className="text-sm text-muted-foreground">
                  Swipe to move between steps. The next screen slides over this
                  one; going back reveals the previous screen underneath at half
                  speed. Continue and Back use the same animation.
                </p>
                <Field>
                  <FieldLabel htmlFor="wizard-example-name">Name</FieldLabel>
                  {picker ? (
                    <SheetSelect
                      label="Name"
                      value={name}
                      onValueChange={setName}
                      options={[{ value: "Ada", label: "Ada Lovelace" }]}
                      placeholder="Select person"
                      triggerVariant="card"
                    />
                  ) : (
                    <Input
                      id="wizard-example-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  )}
                  <FieldDescription>
                    {validation
                      ? "Enter a name to enable the next step."
                      : "Typing and selecting text do not start a swipe."}
                  </FieldDescription>
                </Field>
              </>
            ),
          },
          {
            id: "notes",
            label: "Notes",
            content: (
              <Field>
                <FieldLabel htmlFor="wizard-example-notes">Notes</FieldLabel>
                <Textarea
                  id="wizard-example-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                <FieldDescription>
                  Swipe back to edit details; your values are kept by the form
                  owner. Vertical scrolling and pinch zoom remain available.
                </FieldDescription>
              </Field>
            ),
          },
          {
            id: "review",
            label: "Review",
            content: (
              <div className="flex flex-col gap-4">
                <p>{name || "No name entered"}</p>
                <p>{notes || "No notes entered"}</p>
                <p className="text-sm text-muted-foreground">
                  Swiping never submits the form. Confirm with the button below.
                </p>
              </div>
            ),
          },
        ]}
        footer={
          <FormActions sticky className="mt-auto">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => setIndex(index - 1)}
              >
                Back
              </Button>
            ) : null}
            <SaveButton
              type="submit"
              disabled={disabled || !canGoNext}
              state={complete ? "success" : "idle"}
              idleLabel={index === 2 ? "Confirm booking" : "Continue"}
              pendingLabel="Confirming booking…"
              successLabel="Booking confirmed"
            />
          </FormActions>
        }
      />
    </div>
  );
}

/** Layered navigation with a half-speed underlay for gestures and buttons.
 * Controlled fields live above WizardForm and survive inactive-panel unmounts.
 */
export const ThreeSteps: Story = { render: () => <Example /> };
/** Neither gestures nor buttons can advance until the owner permits it. */
export const ValidationGate: Story = { render: () => <Example validation /> };
export const SubmissionLocked: Story = { render: () => <Example disabled /> };
export const RightToLeft: Story = { render: () => <Example dir="rtl" /> };

/** Touch-drag the picker to navigate; tap it to open the selection sheet. */
export const PickerGestures: Story = { render: () => <Example picker /> };

/** For app screens whose mobile header already displays the form title. */
export const MobileHeaderTitle: Story = {
  render: () => <Example hideHeadingOnMobile />,
};

/** The indicator stays at the scroll edge while the title travels with its fields. */
export const ScrollingContent: Story = {
  render: () => (
    <div className="mx-auto flex w-full max-w-screen-sm flex-col py-6">
      <WizardForm
        activeIndex={0}
        onStepChange={() => {}}
        progressLabel="Booking progress"
        steps={[
          {
            id: "details",
            label: "Rental details",
            content: (
              <div className="grid gap-6">
                {Array.from({ length: 24 }, (_, index) => (
                  <p key={index}>
                    Rental detail {index + 1}. The progress indicator remains
                    visible while the title and fields scroll together.
                  </p>
                ))}
              </div>
            ),
          },
          {
            id: "review",
            label: "Review",
            content: <p>Confirm the rental details.</p>,
          },
        ]}
      />
    </div>
  ),
};
