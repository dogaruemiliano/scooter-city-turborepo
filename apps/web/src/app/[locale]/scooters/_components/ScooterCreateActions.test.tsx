import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScooterCreateActions } from "./ScooterCreateActions";

function Fixture({ ready = false, enabled = true }) {
  return (
    <form>
      <div>Form fields</div>
      <ScooterCreateActions ready={ready} enabled={enabled} status="Draft">
        <button type="submit">Create scooter</button>
      </ScooterCreateActions>
    </form>
  );
}

function actions(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="create-actions"]')!;
}

describe("ScooterCreateActions", () => {
  it("keeps incomplete actions inline and switches to native sticky only when ready", () => {
    const { container, rerender } = render(<Fixture />);
    expect(actions(container)).toHaveClass("static", "bottom-auto");
    expect(actions(container)).toHaveAttribute("data-sticky", "false");
    rerender(<Fixture ready />);
    const panel = actions(container);
    expect(panel.parentElement?.tagName).toBe("FORM");
    expect(panel).toHaveClass("sticky", "self-end");
    expect(panel).not.toHaveClass("static", "fixed", "animate-in");
    expect(panel).not.toHaveAttribute("style");
    expect(panel).toHaveAttribute("data-sticky", "true");
    rerender(<Fixture />);
    expect(actions(container)).toHaveClass("static");
  });

  it("replaces creation with document validation and restores creation after review", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ScooterCreateActions
        ready
        status="Review required"
        review={{ label: "Validate the documents", onClick }}
      >
        <button type="submit">Create scooter</button>
      </ScooterCreateActions>,
    );
    expect(
      screen.queryByRole("button", { name: "Create scooter" }),
    ).not.toBeInTheDocument();
    const review = screen.getByRole("button", {
      name: "Validate the documents",
    });
    expect(review).toHaveClass("bg-warning", "text-warning-foreground");
    expect(review).toHaveAttribute("type", "button");
    review.click();
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<Fixture ready />);
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeInTheDocument();
  });

  it("keeps edit actions inline", () => {
    const { container } = render(<Fixture enabled={false} />);
    expect(container.querySelector('[data-slot="create-actions"]')).toBeNull();
    const panel = container.querySelector('[data-slot="form-actions"]');
    expect(panel).not.toHaveClass("sticky");
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeInTheDocument();
  });
});
