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
