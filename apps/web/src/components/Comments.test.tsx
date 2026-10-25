import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "@repo/ui/components/comments";

function Composer({
  pending = false,
  error,
  onSubmit,
}: {
  pending?: boolean;
  error?: string;
  onSubmit: () => void;
}) {
  const [value, setValue] = useState("Inspection complete");
  return (
    <CommentComposer
      label="Comment"
      value={value}
      onValueChange={setValue}
      error={error}
      submitButton={{
        state: pending ? "pending" : error ? "error" : "idle",
        idleLabel: "Add comment",
        pendingLabel: "Adding comment…",
        successLabel: "Comment added",
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    />
  );
}

describe("shared comment composer", () => {
  it("starts as a single-line composite input with an accessible round send button", () => {
    render(<Composer onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    const send = screen.getByRole("button", { name: "Add comment" });
    expect(input).toHaveAttribute("rows", "1");
    expect(input).toHaveClass("max-h-36");
    expect(send).toHaveClass("rounded-full");
    expect(send.closest('[data-slot="input-group"]')).toContainElement(input);
  });

  it("docks above a mobile keyboard and releases when focus leaves", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 800,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 800);
    try {
      render(<Composer onSubmit={vi.fn()} />);
      const input = screen.getByRole("textbox");
      fireEvent.focusIn(input);
      viewport.height = 450;
      viewport.offsetTop = 20;
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
      const form = input.closest("form")!;
      await waitFor(() =>
        expect(form).toHaveAttribute("data-keyboard-docked", "true"),
      );
      expect(form.style.bottom).toBe("330px");
      fireEvent.focusOut(input, { relatedTarget: document.body });
      await waitFor(() =>
        expect(form).not.toHaveAttribute("data-keyboard-docked"),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("preserves a failed draft and keeps the action label", () => {
    render(<Composer error="Connection lost" onSubmit={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Inspection complete",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByRole("button", { name: "Add comment" })).toBeEnabled();
  });
  it("blocks pending and whitespace-only submissions", async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    const view = render(<Composer onSubmit={submit} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Add comment" })).toBeDisabled();
    view.rerender(<Composer pending onSubmit={submit} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Adding comment…" }));
    expect(submit).not.toHaveBeenCalled();
  });
});
