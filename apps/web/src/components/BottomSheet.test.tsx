import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetTitle,
  BottomSheetFooter,
} from "@repo/ui/components/bottom-sheet";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("uses the translucent blurred sheet surface and lets the footer inherit it", () => {
    render(
      <BottomSheet open>
        <BottomSheetContent>
          <BottomSheetTitle>Frosted sheet</BottomSheetTitle>
          <BottomSheetFooter>Actions</BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>,
    );
    const sheet = screen.getByRole("dialog", { name: "Frosted sheet" });
    expect(sheet).toHaveClass(
      "bg-popover",
      "supports-[backdrop-filter:blur(0)]:bg-bottom-sheet-surface",
      "supports-[backdrop-filter:blur(0)]:backdrop-blur-floating-surface",
    );
    expect(
      sheet.querySelector('[data-slot="bottom-sheet-footer"]'),
    ).toHaveClass("bg-transparent");
    expect(sheet.querySelector(".bg-background")).toBeNull();
  });

  it("keeps a scrolled list gesture separate from the next swipe at the top", () => {
    render(
      <BottomSheet open>
        <BottomSheetContent>
          <BottomSheetTitle>Scrollable options</BottomSheetTitle>
          <div data-testid="list" style={{ overflowY: "auto" }}>
            <span>Option</span>
          </div>
        </BottomSheetContent>
      </BottomSheet>,
    );
    const list = screen.getByTestId("list");
    Object.defineProperties(list, {
      scrollHeight: { value: 600 },
      clientHeight: { value: 200 },
    });
    const viewport = list.closest('[data-slot="bottom-sheet-viewport"]')!;
    list.scrollTop = 80;
    fireEvent.touchStart(screen.getByText("Option"), { touches: [] });
    expect(viewport).toHaveAttribute("data-base-ui-swipe-ignore");
    list.scrollTop = 0;
    fireEvent.touchMove(list, { touches: [] });
    expect(viewport).toHaveAttribute("data-base-ui-swipe-ignore");
    fireEvent.touchEnd(list, { touches: [] });
    expect(viewport).not.toHaveAttribute("data-base-ui-swipe-ignore");
    fireEvent.touchStart(list, { touches: [] });
    expect(viewport).not.toHaveAttribute("data-base-ui-swipe-ignore");
    list.scrollTop = 80;
    fireEvent.touchStart(list, { touches: [] });
    fireEvent.touchCancel(list);
    expect(viewport).not.toHaveAttribute("data-base-ui-swipe-ignore");
  });

  it("keeps ordinary sheets dismissible with Escape", async () => {
    render(<Example />);
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
