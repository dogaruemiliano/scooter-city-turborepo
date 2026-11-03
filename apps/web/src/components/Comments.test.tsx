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
import { spacing } from "@repo/theme";

const iosUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";

function mockViewport({
  userAgent = iosUserAgent,
  platform = "iPhone",
  maxTouchPoints = 5,
  modernWebKit = true,
  width = 390,
} = {}) {
  const viewport = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
  vi.stubGlobal("CSS", { supports: () => modernWebKit });
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
  it("starts as a single-line composite input with an accessible round send button", () => {
    render(<Composer onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    const send = screen.getByRole("button", { name: "Add comment" });
    expect(input).toHaveAttribute("rows", "1");
    expect(input).toHaveClass("max-h-36");
    expect(send).toHaveClass("rounded-full");
    expect(send.closest('[data-slot="input-group"]')).toContainElement(input);
  });

  it.each([
    {
      name: "iOS 26 with a frozen OS version in the user agent",
      environment: {},
      clearance: spacing.iosKeyboardAccessoryClearance,
    },
    {
      name: "iPadOS with a desktop user agent in a narrow viewport",
      environment: {
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
      },
      clearance: spacing.iosKeyboardAccessoryClearance,
    },
    {
      name: "older iOS without the floating toolbar",
      environment: { modernWebKit: false },
      clearance: 0,
    },
    {
      name: "Android with modern CSS support",
      environment: {
        userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/142.0.0.0",
        platform: "Linux armv8l",
      },
      clearance: 0,
    },
    {
      name: "desktop Safari in a narrow window",
      environment: {
        userAgent: "Mozilla/5.0 (Macintosh) Version/26.0 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 0,
      },
      clearance: 0,
    },
  ])(
    "uses only the required keyboard clearance on $name",
    async ({ environment, clearance }) => {
      const viewport = mockViewport(environment);
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
        expect(form.style.bottom).toBe(`${330 + clearance}px`);
        fireEvent.focusOut(input, { relatedTarget: document.body });
        await waitFor(() =>
          expect(form).not.toHaveAttribute("data-keyboard-docked"),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("removes docking and toolbar clearance when the keyboard closes while the input stays focused", () => {
    const viewport = mockViewport();
    try {
      render(<Composer onSubmit={vi.fn()} />);
      const input = screen.getByRole("textbox");
      const form = input.closest("form")!;
      fireEvent.focusIn(input);
      viewport.height = 450;
      act(() => viewport.dispatchEvent(new Event("resize")));
      expect(form).toHaveAttribute("data-keyboard-docked", "true");

      viewport.height = 800;
      act(() => viewport.dispatchEvent(new Event("resize")));
      expect(form).not.toHaveAttribute("data-keyboard-docked");
      expect(form.style.bottom).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { name: "browser chrome", height: 766 },
    { name: "an accessory bar with a hardware keyboard", height: 742 },
  ])("does not lift the composer for $name alone", ({ height }) => {
    const viewport = mockViewport();
    try {
      render(<Composer onSubmit={vi.fn()} />);
      const input = screen.getByRole("textbox");
      fireEvent.focusIn(input);
      viewport.height = height;
      act(() => viewport.dispatchEvent(new Event("resize")));
      const form = input.closest("form")!;
      expect(form).not.toHaveAttribute("data-keyboard-docked");
      expect(form.style.bottom).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the composer at the keyboard edge when Android resizes the layout viewport", () => {
    const viewport = mockViewport({
      userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/142.0.0.0",
      platform: "Linux armv8l",
    });
    try {
      render(<Composer onSubmit={vi.fn()} />);
      const input = screen.getByRole("textbox");
      fireEvent.focusIn(input);
      viewport.height = 450;
      vi.stubGlobal("innerHeight", 450);
      act(() => viewport.dispatchEvent(new Event("resize")));
      const form = input.closest("form")!;
      expect(form).toHaveAttribute("data-keyboard-docked", "true");
      expect(form.style.bottom).toBe("0px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { name: "desktop widths", width: 1024, scale: 1 },
    { name: "pinch zoom", width: 390, scale: 2 },
  ])("does not dock at $name", ({ width, scale }) => {
    const viewport = mockViewport({ width });
    try {
      render(<Composer onSubmit={vi.fn()} />);
      const input = screen.getByRole("textbox");
      fireEvent.focusIn(input);
      viewport.height = 450;
      viewport.scale = scale;
      act(() => viewport.dispatchEvent(new Event("resize")));
      expect(input.closest("form")).not.toHaveAttribute("data-keyboard-docked");
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
