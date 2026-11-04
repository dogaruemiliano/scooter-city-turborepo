import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CommentComposer,
  CommentThread,
  CommentItem,
} from "@repo/ui/components/comments";

function mockViewport(width = 390) {
  const viewport = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("scrollBy", vi.fn());
  return viewport;
}

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
  it("shows only the title and composer in an empty thread", () => {
    render(
      <CommentThread
        title="Comments"
        composer={<Composer onSubmit={vi.fn()} />}
      />,
    );
    const thread = screen.getByRole("region", { name: "Comments" });
    expect(thread.children).toHaveLength(2);
    expect(thread.firstElementChild).toBe(
      screen.getByRole("heading", { name: "Comments" }),
    );
    expect(thread.lastElementChild).toBe(
      screen.getByRole("textbox").closest("form"),
    );
    expect(thread.querySelector("p, ol")).toBeNull();
  });

  it("places the composer before the comment list", () => {
    render(
      <CommentThread
        title="Comments"
        composer={<Composer onSubmit={vi.fn()} />}
      >
        <ol>
          <CommentItem
            author="Alex"
            dateTime="2026-11-04T10:00:00Z"
            timestamp="Today"
          >
            Inspection complete
          </CommentItem>
        </ol>
      </CommentThread>,
    );
    const form = screen.getByRole("textbox").closest("form")!;
    expect(form.nextElementSibling).toBe(screen.getByRole("list"));
  });

  it("starts as a single-line composite input with an accessible round send button", () => {
    render(<Composer onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    const send = screen.getByRole("button", { name: "Add comment" });
    expect(input).toHaveAttribute("rows", "1");
    expect(input).toHaveClass("max-h-36");
    expect(send).toHaveClass("rounded-full");
    expect(send.closest('[data-slot="input-group"]')).toContainElement(input);
  });

  it("keeps its normal layout and never scrolls the document when focused or the keyboard resizes", () => {
    const viewport = mockViewport();
    try {
      render(
        <CommentThread
          title="Comments"
          composer={<Composer onSubmit={vi.fn()} />}
        />,
      );
      const input = screen.getByRole("textbox");
      const form = input.closest("form")!;
      const thread = screen.getByRole("region", { name: "Comments" });
      const before = thread.innerHTML;
      fireEvent.focusIn(input);
      viewport.height = 450;
      viewport.offsetTop = 20;
      act(() => viewport.dispatchEvent(new Event("resize")));
      act(() => viewport.dispatchEvent(new Event("scroll")));
      expect(thread.innerHTML).toBe(before);
      expect(form).not.toHaveAttribute("style");
      expect(form).not.toHaveClass("fixed");
      expect(thread.lastElementChild).toBe(form);
      expect(window.scrollBy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps typing and submission working without the VisualViewport API", async () => {
    vi.stubGlobal("visualViewport", undefined);
    try {
      const submit = vi.fn();
      render(<Composer onSubmit={submit} />);
      const user = userEvent.setup();
      await user.type(screen.getByRole("textbox"), " and tested");
      await user.click(screen.getByRole("button", { name: "Add comment" }));
      expect(submit).toHaveBeenCalledOnce();
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
