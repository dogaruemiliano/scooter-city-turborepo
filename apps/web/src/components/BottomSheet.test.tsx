import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetTitle,
} from "@repo/ui/components/bottom-sheet";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function Example({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet open={open} onOpenChange={setOpen} dismissible={dismissible}>
      <BottomSheetContent>
        <BottomSheetTitle>Required review</BottomSheetTitle>
        <button onClick={() => setOpen(false)}>Complete review</button>
      </BottomSheetContent>
    </BottomSheet>
  );
}

describe("shared bottom-sheet dismissal", () => {
  it("keeps ordinary sheets dismissible with Escape", async () => {
    render(<Example />);
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("locks required sheets but allows the caller to close after completion", async () => {
    render(<Example dismissible={false} />);
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Required review" }),
    ).toBeInTheDocument();
    await user.click(
      document.querySelector('[data-slot="bottom-sheet-overlay"]')!,
    );
    expect(
      screen.getByRole("dialog", { name: "Required review" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete review" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
