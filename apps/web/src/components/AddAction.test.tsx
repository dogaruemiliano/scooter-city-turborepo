import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AddAction } from "@repo/ui/components";

describe("shared AddAction", () => {
  it("describes the centered action without adding its hint to the accessible name", () => {
    render(
      <AddAction
        text="Add"
        icon={<Plus />}
        subtext="Checklist · Buy list · Location"
      />,
    );
    const action = screen.getByRole("button", { name: "Add" });
    expect(action).toHaveAccessibleDescription(
      "Checklist · Buy list · Location",
    );
    expect(action).toHaveClass(
      "border-dashed",
      "bg-control",
      "rounded-dashed-surface",
      "grid-rows-3",
    );
    expect(screen.getByText("Add").parentElement).toHaveClass("row-start-2");
  });

  it("forwards refs and click events and does not submit its enclosing form", async () => {
    const clicked = vi.fn();
    const submitted = vi.fn((event) => event.preventDefault());
    const ref = createRef<HTMLButtonElement>();
    render(
      <form onSubmit={submitted}>
        <AddAction
          ref={ref}
          text="Add item"
          icon={<Plus />}
          onClick={clicked}
        />
      </form>,
    );
    const action = screen.getByRole("button", { name: "Add item" });
    expect(ref.current).toBe(action);
    await userEvent.setup().click(action);
    expect(clicked).toHaveBeenCalledOnce();
    expect(submitted).not.toHaveBeenCalled();
    expect(action).not.toHaveAttribute("aria-describedby");
  });

  it("disables the action", async () => {
    const clicked = vi.fn();
    render(<AddAction text="Add" icon={<Plus />} disabled onClick={clicked} />);
    const action = screen.getByRole("button", { name: "Add" });
    expect(action).toBeDisabled();
    await userEvent.setup().click(action);
    expect(clicked).not.toHaveBeenCalled();
  });
});
