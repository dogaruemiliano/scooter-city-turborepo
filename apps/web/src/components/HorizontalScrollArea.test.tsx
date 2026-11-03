import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorizontalScrollArea } from "@repo/ui/components/horizontal-scroll-area";

describe("horizontal overflow fades", () => {
  it("keeps the fade fixed over the padding from the first pixel of scrolling", () => {
    render(
      <HorizontalScrollArea label="Drafts" fadeEdges>
        <button>Draft one</button>
      </HorizontalScrollArea>,
    );
    const viewport = screen.getByRole("region", { name: "Drafts" });
    expect(viewport).toHaveClass(
      "[--scroll-fade-start:transparent]",
      "[--scroll-fade-end:transparent]",
    );
    expect(viewport.className).not.toContain("data-[overflow-x");
    expect(viewport.style.getPropertyValue("--scroll-fade-width")).toBe(
      "var(--spacing-6)",
    );
    expect(viewport.style.maskImage).toContain("var(--scroll-fade-width)");
    const mask = viewport.style.maskImage;
    viewport.scrollLeft = 1;
    fireEvent.scroll(viewport);
    expect(viewport.style.maskImage).toBe(mask);
    expect(screen.getByRole("button", { name: "Draft one" })).toBeEnabled();
  });
  it("reserves scrollbar spacing only on desktop without disabling the viewport", () => {
    render(
      <HorizontalScrollArea label="Drafts" scrollbarVisibility="desktop">
        <button>Draft one</button>
      </HorizontalScrollArea>,
    );
    const viewport = screen.getByRole("region", { name: "Drafts" });
    const root = viewport.closest('[data-slot="horizontal-scroll-area"]')!;
    expect(root).toHaveClass("lg:data-[has-overflow-x]:pb-5");
    expect(root).not.toHaveClass("data-[has-overflow-x]:pb-5");
    expect(viewport).toHaveAttribute("tabindex", "0");
  });
  it("preserves the unfaded default for existing callers", () => {
    render(
      <HorizontalScrollArea label="Repairs">
        <span>Open</span>
      </HorizontalScrollArea>,
    );
    expect(
      screen.getByRole("region", { name: "Repairs" }).className,
    ).not.toContain("mask-image");
  });

  it("hides the scrollbar without reserving space or removing arrow navigation", () => {
    render(
      <HorizontalScrollArea
        label="Repairs"
        scrollbarVisibility="hidden"
        scrollLeftLabel="Scroll repairs left"
        scrollRightLabel="Scroll repairs right"
      >
        <span>Open</span>
      </HorizontalScrollArea>,
    );
    const viewport = screen.getByRole("region", { name: "Repairs" });
    const root = viewport.closest('[data-slot="horizontal-scroll-area"]')!;
    expect(root.className).not.toContain("pb-5");
    expect(viewport).toHaveAttribute("tabindex", "0");
    for (const name of ["Scroll repairs left", "Scroll repairs right"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeEnabled();
      expect(button.parentElement).toHaveClass("bottom-0");
      expect(button.parentElement?.className).not.toContain("bottom-5");
      expect(button.parentElement?.className).not.toContain("bg-linear");
    }
  });
});

describe("horizontal scroll arrows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderBoard() {
    render(
      <HorizontalScrollArea
        label="Repairs"
        scrollLeftLabel="Scroll repairs left"
        scrollRightLabel="Scroll repairs right"
      >
        <span>Open</span>
      </HorizontalScrollArea>,
    );
    return screen.getByRole("region", { name: "Repairs" });
  }

  it("scrolls one column in either direction, respecting reduced motion", () => {
    const viewport = renderBoard();
    const scrollBy = vi.fn();
    viewport.scrollBy = scrollBy;
    const left = screen.getByRole("button", { name: "Scroll repairs left" });
    const right = screen.getByRole("button", { name: "Scroll repairs right" });

    fireEvent.click(right);
    const step = scrollBy.mock.calls[0]![0].left;
    expect(step).toBeGreaterThan(0);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: step,
      behavior: "smooth",
    });
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -step,
      behavior: "smooth",
    });

    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -step,
      behavior: "instant",
    });
  });

  it("scrolls back on left-edge hover, switches direction, and stops at the start", () => {
    class TestPointerEvent extends MouseEvent {
      pointerType = "mouse";
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const viewport = renderBoard();
    Object.defineProperties(viewport, {
      clientWidth: { value: 500 },
      scrollWidth: { value: 1500 },
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 500,
      top: 0,
      bottom: 400,
    } as DOMRect);
    viewport.scrollLeft = 200;
    let advance: FrameRequestCallback;
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        advance = callback;
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    fireEvent.pointerMove(viewport, { clientX: 1, clientY: 200 });
    advance!(0);
    advance!(100);
    expect(viewport.scrollLeft).toBeLessThan(200);
    const scrolledLeft = viewport.scrollLeft;

    fireEvent.pointerMove(viewport, { clientX: 499, clientY: 200 });
    advance!(200);
    advance!(300);
    expect(viewport.scrollLeft).toBeGreaterThan(scrolledLeft);

    fireEvent.pointerMove(viewport, { clientX: 1, clientY: 200 });
    viewport.scrollLeft = 0;
    requestFrame.mockClear();
    advance!(400);
    expect(viewport.scrollLeft).toBe(0);
    expect(requestFrame).not.toHaveBeenCalled();
  });
});
