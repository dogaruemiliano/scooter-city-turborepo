import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { StepProgress } from "@repo/ui/components/step-progress";

const defaults = {
  labels: ["Details", "Documents", "Review"],
  activeIndex: 0,
  label: "Form progress",
};

it("fills the current segment and tracks the next without changing committed progress", () => {
  const { container, rerender } = render(<StepProgress {...defaults} />);
  const fills = () =>
    container.querySelectorAll('[data-slot="step-progress-fill"]');
  expect(fills()[0]).toHaveStyle({ transform: "scaleX(1)" });
  expect(fills()[1]).toHaveStyle({ transform: "scaleX(0)" });
  rerender(<StepProgress {...defaults} visualIndex={0.5} tracking />);
  expect(fills()[1]).toHaveStyle({
    transform: "scaleX(0.5)",
    transitionProperty: "none",
  });
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  rerender(<StepProgress {...defaults} activeIndex={1} />);
  expect(fills()[1]).toHaveStyle({ transform: "scaleX(1)" });
  rerender(<StepProgress {...defaults} />);
  expect(fills()[1]).toHaveStyle({ transform: "scaleX(0)" });
  expect(fills()[1]).toHaveClass(
    "motion-reduce:transition-none",
    "rtl:origin-right",
  );
});

it("only exposes authorized navigation and locks it while disabled", async () => {
  const onStepSelect = vi.fn();
  const user = userEvent.setup();
  const props = {
    ...defaults,
    activeIndex: 1,
    canSelectStep: (index: number) => index === 0,
    onStepSelect,
  };
  const { rerender } = render(<StepProgress {...props} />);
  const list = screen.getByRole("list", { name: "Form progress" });
  expect(within(list).getAllByRole("button")).toHaveLength(1);
  const back = within(list).getByRole("button", { name: "Details" });
  back.focus();
  await user.keyboard("{Enter}");
  expect(onStepSelect).toHaveBeenCalledExactlyOnceWith(0);
  rerender(<StepProgress {...props} disabled />);
  await user.click(back);
  expect(back).toBeDisabled();
  expect(onStepSelect).toHaveBeenCalledTimes(1);
});

it("handles a single step without invalid fill calculations", () => {
  const { container } = render(
    <StepProgress {...defaults} labels={["Review"]} />,
  );
  expect(
    container.querySelector('[data-slot="step-progress-fill"]'),
  ).toHaveStyle({ transform: "scaleX(1)" });
});
