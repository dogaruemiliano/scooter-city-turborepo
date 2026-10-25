import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { motion } from "@repo/theme";
import {
  WizardForm,
  type WizardFormProps,
} from "@repo/ui/components/wizard-form";

const requested = vi.fn();
const submitted = vi.fn();
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  requested.mockClear();
  submitted.mockClear();
});

function Harness({
  start = 0,
  reject = false,
  ...props
}: Partial<WizardFormProps> & { start?: number; reject?: boolean }) {
  const [index, setIndex] = useState(start);
  const [value, setValue] = useState("");
  return (
    <WizardForm
      steps={[
        {
          id: "details",
          label: "Details",
          content: (
            <label>
              Name
              <input
                name="name"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          ),
        },
        {
          id: "notes",
          label: "Notes",
          content: <textarea name="notes" aria-label="Notes" />,
        },
        { id: "review", label: "Review", content: <p>Ready to confirm</p> },
      ]}
      activeIndex={index}
      progressLabel="Wizard progress"
      onStepChange={(next) => {
        requested(next);
        if (!reject) setIndex(next);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submitted();
      }}
      footer={
        <div data-testid="footer">
          <button
            type="button"
            onClick={() => setIndex(Math.max(0, index - 1))}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setIndex(Math.min(2, index + 1))}
          >
            Continue
          </button>
        </div>
      }
      {...props}
    />
  );
}

function setup(props: Parameters<typeof Harness>[0] = {}) {
  const result = render(<Harness {...props} />);
  const viewport = result.container.querySelector<HTMLElement>(
    '[data-slot="wizard-viewport"]',
  )!;
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    width: 400,
  } as DOMRect);
  return {
    ...result,
    viewport,
    fill: result.container.querySelectorAll<HTMLElement>(
      '[data-slot="step-progress-fill"]',
    )[1]!,
    panels: () => [
      ...result.container.querySelectorAll<HTMLElement>(
        '[data-slot="wizard-step"]',
      ),
    ],
  };
}
function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y = 100,
  id = 1,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: "touch" },
    isPrimary: { value: id === 1 },
  });
  fireEvent(target, event);
}
function swipe(viewport: HTMLElement, from: number, to: number) {
  pointer(viewport, "pointerdown", from);
  pointer(viewport, "pointermove", to);
  pointer(viewport, "pointerup", to);
}

it("tracks content and fractional progress together, commits once on release, and excludes inactive fields", () => {
  const { viewport, fill, panels, container } = setup();
  pointer(viewport, "pointerdown", 300);
  pointer(viewport, "pointermove", 100);
  expect(panels()[0]).toHaveStyle({
    transform: "translateX(-25%)",
    transitionProperty: "none",
  });
  expect(panels()[1]).toHaveStyle({ transform: "translateX(50%)" });
  expect(fill).toHaveStyle({
    transform: "scaleX(0.5)",
    transitionProperty: "none",
  });
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  expect(requested).not.toHaveBeenCalled();
  const preview = panels()[1]!;
  expect(preview).toHaveAttribute("inert");
  expect(preview).toHaveAttribute("aria-hidden", "true");
  expect(new FormData(container.querySelector("form")!).has("notes")).toBe(
    false,
  );
  pointer(viewport, "pointerup", 100);
  pointer(viewport, "lostpointercapture", 100);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  expect(screen.getByRole("heading", { name: "Notes" })).toHaveFocus();
  expect(fill).toHaveStyle({ transform: "scaleX(1)" });
  expect(submitted).not.toHaveBeenCalled();
  expect(viewport).not.toContainElement(screen.getByTestId("footer"));
});

it("empties progress while tracking backwards and commits only the previous step", () => {
  const { viewport, fill, panels } = setup({ start: 1 });
  expect(panels()[0]).toHaveStyle({ transform: "translateX(-50%)" });
  pointer(viewport, "pointerdown", 100);
  pointer(viewport, "pointermove", 300);
  expect(fill).toHaveStyle({ transform: "scaleX(0.5)" });
  expect(panels()[1]).toHaveStyle({ transform: "translateX(50%)" });
  expect(panels()[0]).toHaveStyle({ transform: "translateX(-25%)" });
  expect(Number(panels()[1]!.style.zIndex)).toBeGreaterThan(
    Number(panels()[0]!.style.zIndex),
  );
  pointer(viewport, "pointerup", 300);
  expect(requested).toHaveBeenCalledExactlyOnceWith(0);
  expect(screen.getByRole("heading", { name: "Details" })).toHaveFocus();
});

it.each([
  "pointercancel",
  "lostpointercapture",
  "short",
  "vertical",
  "multitouch",
])("snaps back without navigation on %s", (end) => {
  const { viewport, fill, panels } = setup();
  pointer(viewport, "pointerdown", 300);
  pointer(
    viewport,
    "pointermove",
    end === "short" ? 280 : end === "vertical" ? 295 : 100,
    end === "vertical" ? 250 : 100,
  );
  if (end === "multitouch") pointer(viewport, "pointerdown", 100, 100, 2);
  else
    pointer(
      viewport,
      end === "short" || end === "vertical" ? "pointerup" : end,
      100,
    );
  expect(requested).not.toHaveBeenCalled();
  expect(fill).toHaveStyle({ transform: "scaleX(0)" });
  expect(panels()[0]).toHaveStyle({ transform: "translateX(0%)" });
});

it("handles a rejected request by snapping back to the controlled step", () => {
  const { viewport, fill } = setup({ reject: true });
  swipe(viewport, 300, 100);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  expect(fill).toHaveStyle({ transform: "scaleX(0)" });
});

it.each([{ canGoNext: false }, { disabled: true }])(
  "keeps validation and submission locks in charge (%j)",
  (props) => {
    const { viewport, fill } = setup(props);
    swipe(viewport, 300, 100);
    expect(requested).not.toHaveBeenCalled();
    expect(fill).toHaveStyle({ transform: "scaleX(0)" });
  },
);

it("does not swipe past either boundary or submit from the final step", () => {
  const first = setup();
  swipe(first.viewport, 100, 350);
  expect(requested).not.toHaveBeenCalled();
  first.unmount();
  const last = setup({ start: 2 });
  swipe(last.viewport, 350, 100);
  expect(requested).not.toHaveBeenCalled();
  expect(submitted).not.toHaveBeenCalled();
});

it("leaves input interactions alone and preserves controlled field values through button navigation", async () => {
  const user = userEvent.setup();
  const { viewport } = setup();
  const input = screen.getByRole("textbox", { name: "Name" });
  pointer(input, "pointerdown", 300);
  pointer(viewport, "pointermove", 50);
  pointer(viewport, "pointerup", 50);
  expect(requested).not.toHaveBeenCalled();
  await user.type(input, "Ada");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Notes" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
});

it("reverses swipe direction and progress origin for RTL", () => {
  const { viewport, fill } = setup({ dir: "rtl" });
  swipe(viewport, 100, 300);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
  expect(fill).toHaveClass("rtl:origin-right");
});

it("removes outgoing fields after settling, with an instant reduced-motion path", () => {
  vi.useFakeTimers();
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
  } as MediaQueryList);
  const { viewport, panels } = setup();
  swipe(viewport, 300, 100);
  expect(panels()[0]).toHaveClass("motion-reduce:transition-none");
  act(() => vi.advanceTimersByTime(motion.duration.instant));
  expect(
    within(panels()[0]!).queryByRole("textbox", { hidden: true }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Notes" })).toBeVisible();
});

it("keeps tracking when touch capture transfers from a child to the viewport", () => {
  const { viewport, fill } = setup();
  const heading = screen.getByRole("heading", { name: "Details" });
  pointer(heading, "pointerdown", 300);
  pointer(viewport, "pointermove", 200);
  pointer(heading, "lostpointercapture", 200);
  pointer(viewport, "pointermove", 100);
  expect(fill).toHaveStyle({ transform: "scaleX(0.5)" });
  pointer(viewport, "pointerup", 100);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
});

it("keeps opaque overlapping surfaces and the incoming screen above the outgoing one", () => {
  const { viewport, panels, container } = setup({ className: "bg-popover" });
  expect(container.querySelector("form")).toHaveClass("bg-popover");
  expect(container.querySelector("form")).not.toHaveClass("bg-background");
  expect(viewport).toHaveClass("isolate", "bg-inherit");
  pointer(viewport, "pointerdown", 300);
  pointer(viewport, "pointermove", 100);
  expect(panels()[0]).toHaveClass("bg-inherit", "min-h-full");
  expect(panels()[1]).toHaveClass("bg-inherit", "min-h-full", "shadow-md");
  expect(Number(panels()[1]!.style.zIndex)).toBeGreaterThan(
    Number(panels()[0]!.style.zIndex),
  );
});

it("uses the same layered endpoints when navigating with buttons", async () => {
  const user = userEvent.setup();
  const { panels } = setup();
  expect(panels()[0]).toHaveStyle({ transform: "translateX(0%)" });
  expect(panels()[1]).toHaveStyle({ transform: "translateX(100%)" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(panels()[0]).toHaveStyle({ transform: "translateX(-50%)" });
  expect(panels()[1]).toHaveStyle({ transform: "translateX(0%)" });
  expect(panels()[0]).toHaveClass("transition-transform");
  expect(panels()[1]).toHaveClass("transition-transform");
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(panels()[0]).toHaveStyle({ transform: "translateX(0%)" });
  expect(panels()[1]).toHaveStyle({ transform: "translateX(100%)" });
});

it("mirrors foreground and underlay travel for RTL gestures", () => {
  const { viewport, panels } = setup({ dir: "rtl", start: 1 });
  pointer(viewport, "pointerdown", 300);
  pointer(viewport, "pointermove", 100);
  expect(panels()[1]).toHaveStyle({ transform: "translateX(-50%)" });
  expect(panels()[0]).toHaveStyle({ transform: "translateX(25%)" });
});

it("extends the sliding viewport through its own gutter while keeping panel content inset", () => {
  const { viewport, panels, container } = setup();
  const form = container.querySelector("form")!;
  expect(form).toHaveClass(
    "px-(--wizard-gutter)",
    "[--wizard-gutter:var(--page-gutter,var(--spacing-4))]",
    "sm:[--wizard-gutter:var(--page-gutter,var(--spacing-6))]",
  );
  expect(viewport).toHaveClass("-mx-(--wizard-gutter)");
  for (const panel of panels())
    expect(panel).toHaveClass("px-(--wizard-gutter)");
  expect(viewport).not.toContainElement(screen.getByRole("progressbar"));
  expect(viewport).not.toContainElement(screen.getByTestId("footer"));
});

it.each(["pointerup", "pointercancel", "lostpointercapture", "multitouch"])(
  "finishes safely when capture expires during %s and allows the next gesture",
  (end) => {
    const { viewport, fill } = setup({ reject: true });
    const release = vi.fn(() => {
      throw new DOMException("Invalid pointer id", "NotFoundError");
    });
    Object.defineProperties(viewport, {
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: release },
    });
    pointer(viewport, "pointerdown", 300);
    pointer(viewport, "pointermove", 100);
    if (end === "multitouch") pointer(viewport, "pointerdown", 100, 100, 2);
    else pointer(viewport, end, 100);
    expect(release).toHaveBeenCalledWith(1);
    expect(fill).toHaveStyle({ transform: "scaleX(0)" });
    expect(requested).toHaveBeenCalledTimes(end === "pointerup" ? 1 : 0);
    requested.mockClear();
    swipe(viewport, 300, 100);
    expect(requested).toHaveBeenCalledExactlyOnceWith(1);
  },
);

it("cancels safely if the pointer expires before capture can be acquired", () => {
  const { viewport, fill } = setup();
  const capture = vi.fn(() => {
    throw new DOMException("Invalid pointer id", "NotFoundError");
  });
  Object.defineProperty(viewport, "setPointerCapture", {
    configurable: true,
    value: capture,
  });
  swipe(viewport, 300, 100);
  expect(capture).toHaveBeenCalledWith(1);
  expect(requested).not.toHaveBeenCalled();
  expect(fill).toHaveStyle({ transform: "scaleX(0)" });
  expect(viewport).not.toHaveAttribute("data-dragging");
});

it("allows touch swipes across picker cards while preserving ordinary taps", () => {
  const open = vi.fn();
  const { viewport } = setup({
    steps: [
      {
        id: "details",
        label: "Details",
        content: (
          <button type="button" onClick={open}>
            <span>Selected renter</span>
          </button>
        ),
      },
      { id: "notes", label: "Notes", content: <p>Review selection</p> },
    ],
  });
  const card = screen.getByText("Selected renter");
  pointer(card, "pointerdown", 300);
  pointer(card, "pointerup", 300);
  fireEvent.click(card, { detail: 1 });
  expect(open).toHaveBeenCalledTimes(1);
  pointer(card, "pointerdown", 300);
  pointer(viewport, "pointermove", 100);
  pointer(viewport, "pointerup", 100);
  fireEvent.click(card, { detail: 1 });
  expect(open).toHaveBeenCalledTimes(1);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
});

it("allows touch swipes from field labels", () => {
  const { viewport } = setup();
  const label = screen.getByText("Name");
  pointer(label, "pointerdown", 300);
  pointer(viewport, "pointermove", 100);
  pointer(viewport, "pointerup", 100);
  expect(requested).toHaveBeenCalledExactlyOnceWith(1);
});

it("lets vertical drags on a picker remain scrolling gestures", () => {
  const { viewport } = setup({
    steps: [
      {
        id: "details",
        label: "Details",
        content: <button type="button">Selected renter</button>,
      },
      { id: "notes", label: "Notes", content: <p>Review selection</p> },
    ],
  });
  pointer(
    screen.getByRole("button", { name: "Selected renter" }),
    "pointerdown",
    300,
  );
  pointer(viewport, "pointermove", 295, 250);
  pointer(viewport, "pointerup", 295, 250);
  expect(requested).not.toHaveBeenCalled();
});

it("can visually hide mobile headings while retaining focus and desktop headings", () => {
  const { viewport } = setup({ hideHeadingOnMobile: true });
  expect(screen.getByRole("heading", { name: "Details" })).toHaveClass(
    "sr-only",
    "md:not-sr-only",
  );
  swipe(viewport, 300, 100);
  const heading = screen.getByRole("heading", { name: "Notes" });
  expect(heading).toHaveClass("sr-only", "md:not-sr-only");
  expect(heading).toHaveFocus();
});

it("keeps progress sticky outside the moving content and the decorated title inside it", () => {
  const { container, viewport } = setup();
  const progress = container.querySelector('[data-slot="wizard-progress"]')!;
  expect(progress).toHaveClass("sticky", "bg-inherit");
  expect(progress).not.toContainElement(
    screen.getByRole("heading", { name: "Details" }),
  );
  expect(viewport).toContainElement(
    screen.getByRole("heading", { name: "Details" }),
  );
  expect(
    screen
      .getByRole("heading", { name: "Details" })
      .querySelector('[data-slot="vertical-line"]'),
  ).toHaveAttribute("aria-hidden", "true");
});
