import { FormActions } from "@repo/ui/components/form-actions";
import { Button } from "@repo/ui/components/button";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

function Fixture({
  ready,
  pending = false,
}: {
  ready: boolean;
  pending?: boolean;
}) {
  return (
    <form>
      <FormActions ready={ready} pending={pending}>
        <Button type="submit" disabled={!ready || pending}>
          {pending ? "Saving" : "Save"}
        </Button>
      </FormActions>
    </form>
  );
}

it("reveals valid actions, keeps the same controls during submission, and returns inline when invalid", () => {
  const { container, rerender } = render(<Fixture ready={false} />);
  const panel = container.querySelector('[data-slot="form-actions"]')!;
  const submit = screen.getByRole("button", { name: "Save" });
  expect(panel).toHaveAttribute("data-sticky", "false");
  expect(panel).toHaveClass("static");
  expect(panel).not.toHaveClass("animate-in");
  expect(submit).toBeDisabled();

  rerender(<Fixture ready />);
  expect(panel).toHaveAttribute("data-sticky", "true");
  expect(panel).toHaveClass(
    "sticky",
    "animate-in",
    "slide-in-from-bottom-4",
    "duration-normal",
    "motion-reduce:animate-none",
    "group-data-[keyboard-open=true]/keyboard-aware:static",
  );
  expect(submit).not.toBeDisabled();
  submit.focus();

  rerender(<Fixture ready={false} pending />);
  expect(panel).toHaveAttribute("data-sticky", "true");
  expect(panel).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Saving" })).toBe(submit);
  expect(submit).toBeDisabled();
  expect(submit).toHaveFocus();

  rerender(<Fixture ready={false} />);
  expect(panel).toHaveAttribute("data-sticky", "false");
  expect(panel).toHaveClass("static");
  expect(panel).not.toHaveClass("animate-in");
});

it("leaves contained footers in the normal flow when readiness is omitted", () => {
  const { container } = render(
    <FormActions pending>
      <Button disabled>Save</Button>
    </FormActions>,
  );
  expect(container.querySelector('[data-slot="form-actions"]')).not.toHaveClass(
    "sticky",
    "animate-in",
  );
});

it("reserves secondary navigation for desktop in page bars, including invalid forms", () => {
  const { rerender } = render(
    <FormActions
      ready={false}
      secondaryAction={<Button>Cancel</Button>}
      status="Review details"
    >
      <Button>Create</Button>
    </FormActions>,
  );
  const secondary = screen
    .getByText("Cancel")
    .closest('[data-slot="form-actions-secondary"]');
  expect(secondary).toHaveClass("hidden", "md:flex");
  const primary = screen.getByText("Create");
  expect(primary.parentElement).toHaveClass("flex", "items-center");
  expect(primary.parentElement).not.toHaveClass("flex-col", "flex-wrap");
  expect(screen.getByRole("status").nextElementSibling).toBe(
    primary.parentElement,
  );
  rerender(
    <FormActions
      ready
      pending
      secondaryAction={<Button disabled>Cancel</Button>}
    >
      <Button disabled>Creating</Button>
    </FormActions>,
  );
  expect(
    screen.getByText("Cancel").closest('[data-slot="form-actions-secondary"]'),
  ).toBe(secondary);
});

it("retains secondary actions and primary-first ordering in contained split footers", () => {
  render(
    <FormActions arrangement="split" secondaryAction={<Button>Cancel</Button>}>
      <Button>Confirm</Button>
    </FormActions>,
  );
  const primary = screen.getByText("Confirm");
  expect(primary.parentElement?.firstElementChild).toBe(primary);
  expect(screen.getByText("Cancel").parentElement).toHaveClass("contents");
});
