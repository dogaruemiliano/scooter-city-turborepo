import { spacing } from "@repo/theme";
import {
  ImageViewer,
  type ImageViewerLabels,
} from "@repo/ui/components/image-viewer";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: ImageViewerLabels = {
  close: "Close",
  previous: "Previous",
  next: "Next",
  grid: "Toggle grid",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  loading: "Loading",
  error: "Image failed",
  retry: "Retry",
  position: (index, count) => `${index} / ${count}`,
};
const images = [
  { id: "a", src: "/a.jpg", alt: "First", fileName: "a.jpg" },
  { id: "b", src: "/b.jpg", alt: "Second", fileName: "b.jpg" },
];
function Gallery() {
  const [id, setId] = useState("a");
  return (
    <ImageViewer
      open
      onOpenChange={() => {}}
      images={images}
      activeId={id}
      onActiveIdChange={setId}
      title="Photos"
      labels={labels}
    />
  );
}
function swipe(
  node: HTMLElement,
  from: number,
  to: number,
  secondPointer = false,
) {
  const pointer = (type: string, x: number, id = 1) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: 100,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: "touch" },
    });
    fireEvent(node, event);
  };
  pointer("pointerdown", from);
  if (secondPointer) pointer("pointerdown", from + 20, 2);
  pointer("pointermove", to);
  if (secondPointer) pointer("pointerup", from + 20, 2);
  pointer("pointerup", to);
}

afterEach(() => vi.restoreAllMocks());

describe("shared image viewer", () => {
  function downward(
    node: HTMLElement,
    type: string,
    y: number,
    pointerId = 1,
    x = 200,
  ) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: "touch" },
    });
    fireEvent(node, event);
  }
  function closable() {
    const close = vi.fn();
    const change = vi.fn();
    render(
      <ImageViewer
        open
        onOpenChange={close}
        images={images.slice(0, 1)}
        activeId="a"
        onActiveIdChange={change}
        title="Photos"
        labels={labels}
        footer={<button>Footer action</button>}
      />,
    );
    return {
      close,
      change,
      viewport: document.querySelector<HTMLElement>(
        '[data-slot="document-zoom-viewport"]',
      )!,
    };
  }
  it("tracks a downward swipe and closes even a single-image viewer", () => {
    const { close, change, viewport } = closable();
    downward(viewport, "pointerdown", 100);
    downward(viewport, "pointermove", 220);
    expect(screen.getByRole("dialog")).toHaveStyle({
      transform: "translateY(120px)",
    });
    expect(viewport.firstElementChild).toHaveStyle({
      transform: "translate(0px, 0px) scale(1)",
    });
    expect(screen.getByRole("dialog")).toContainElement(
      screen.getByRole("button", { name: "Close" }),
    );
    expect(screen.getByRole("dialog")).toContainElement(
      screen.getByRole("button", { name: "Zoom in" }),
    );
    downward(viewport, "pointerup", 220);
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
    expect(change).not.toHaveBeenCalled();
  });
  it.each(["short", "upward", "cancel", "lost capture", "pinch", "zoomed"])(
    "does not close for a %s gesture",
    (kind) => {
      const { close, viewport } = closable();
      if (kind === "zoomed")
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      downward(viewport, "pointerdown", 100);
      if (kind === "pinch") downward(viewport, "pointerdown", 100, 2, 240);
      const end = kind === "short" ? 120 : kind === "upward" ? 0 : 220;
      downward(viewport, "pointermove", end);
      if (kind === "cancel") downward(viewport, "pointercancel", end);
      else if (kind === "lost capture")
        downward(viewport, "lostpointercapture", end);
      else {
        if (kind === "pinch") downward(viewport, "pointerup", 100, 2, 240);
        downward(viewport, "pointerup", end);
      }
      expect(close).not.toHaveBeenCalled();
      if (kind !== "zoomed" && kind !== "pinch") {
        expect(screen.getByRole("dialog").style.transform).toBe("");
        expect(viewport.firstElementChild).toHaveStyle({
          transform: "translate(0px, 0px) scale(1)",
        });
      }
    },
  );
  it("finishes the downward animation before closing", async () => {
    let finish!: () => void;
    const animate = vi.fn<
      (
        frames: Keyframe[],
        options: KeyframeAnimationOptions,
      ) => { finished: Promise<void>; cancel: () => void }
    >(() => ({
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      cancel: vi.fn(),
    }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const { close, viewport } = closable();
    Object.defineProperty(screen.getByRole("dialog"), "clientHeight", {
      value: 800,
    });
    downward(viewport, "pointerdown", 100);
    downward(viewport, "pointermove", 220);
    downward(viewport, "pointerup", 220);
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: "translateY(120px)" },
      { transform: "translateY(800px)" },
    ]);
    expect(animate.mock.contexts[0]).toBe(screen.getByRole("dialog"));
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("tracks the drag and animates release before advancing", async () => {
    let finish!: () => void;
    const animate = vi.fn().mockImplementation(() => ({
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      cancel: vi.fn(),
    }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    render(<Gallery />);
    const viewport = document.querySelector<HTMLElement>(
      '[data-slot="document-zoom-viewport"]',
    )!;
    Object.defineProperty(viewport, "clientWidth", { value: 400 });
    const pointer = (type: string, clientX: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX,
        clientY: 100,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "touch" },
      });
      fireEvent(viewport, event);
    };
    pointer("pointerdown", 250);
    pointer("pointermove", 150);
    expect(viewport.firstElementChild).toHaveStyle({
      transform: "translate(-100px, 0px) scale(1)",
    });
    pointer("pointerup", 150);
    expect(screen.getByRole("img", { name: "First" })).toBeInTheDocument();
    expect(animate.mock.calls[0]![0]).toEqual([
      { transform: "translateX(-100px)" },
      { transform: "translateX(-400px)" },
    ]);
    await act(async () => {
      finish();
    });
    expect(screen.getByRole("img", { name: "Second" })).toBeInTheDocument();
    expect(animate.mock.calls[1]![0][0]).toEqual({
      transform: "translateX(0px)",
    }); // jsdom's new viewport has no layout
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });
  it("navigates by swipe and resets zoom, without cycling past boundaries", () => {
    render(<Gallery />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    const viewport = document.querySelector<HTMLElement>(
      '[data-slot="document-zoom-viewport"]',
    )!;
    swipe(viewport, 250, 100);
    expect(screen.getByRole("img", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    swipe(
      document.querySelector<HTMLElement>(
        '[data-slot="document-zoom-viewport"]',
      )!,
      100,
      250,
    );
    expect(screen.getByRole("img", { name: "Second" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(
      screen.getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("100%");
  });
  it("does not navigate after a two-finger gesture", () => {
    render(<Gallery />);
    swipe(
      document.querySelector<HTMLElement>(
        '[data-slot="document-zoom-viewport"]',
      )!,
      250,
      100,
      true,
    );
    expect(screen.getByRole("img", { name: "First" })).toBeInTheDocument();
  });
  it("toggles a grid inside the transformed image bounds", () => {
    render(<Gallery />);
    const image = screen.getByRole("img", { name: "First" });
    Object.defineProperties(image, {
      naturalWidth: { value: 1200 },
      naturalHeight: { value: 800 },
    });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole("button", { name: "Toggle grid" }));
    const grid = document.querySelector('[data-slot="image-grid"]')!;
    expect(grid.parentElement).toBe(image.parentElement);
    expect(grid.closest('[data-slot="document-zoom-viewport"]')).toBeTruthy();
    expect(grid).toHaveClass("pointer-events-none");
    const strokes = grid.querySelectorAll("path");
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).toHaveAttribute("stroke", "var(--image-grid-outline)");
    expect(strokes[1]).toHaveAttribute("stroke", "var(--image-grid-line)");
    const outlineWidth = Number(strokes[0]!.getAttribute("stroke-width"));
    const centerWidth = Number(strokes[1]!.getAttribute("stroke-width"));
    expect(outlineWidth).toBe(spacing[0.5]);
    expect(centerWidth).toBe(spacing.px);
    expect((outlineWidth - centerWidth) / 2).toBe(spacing.px / 2);
    for (const stroke of strokes)
      expect(stroke).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(screen.getByRole("button", { name: "Toggle grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle grid" }));
    expect(document.querySelector('[data-slot="image-grid"]')).toBeNull();
  });
  it("keeps side actions outside zoomed content and supports keyboard navigation", () => {
    const action = vi.fn();
    const change = vi.fn();
    render(
      <ImageViewer
        open
        onOpenChange={() => {}}
        images={images}
        activeId="a"
        onActiveIdChange={change}
        title="Photos"
        labels={labels}
        rightActions={<button onClick={action}>Custom action</button>}
      />,
    );
    const button = screen.getByRole("button", { name: "Custom action" });
    expect(button.closest('[data-slot="document-zoom-viewport"]')).toBeNull();
    fireEvent.click(button);
    expect(action).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(
      document.querySelector('[data-slot="document-zoom-viewport"]')!,
      { key: "ArrowRight" },
    );
    expect(change).toHaveBeenCalledWith("b");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-popover");
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
  });
  it("offers retry when an image fails", () => {
    render(<Gallery />);
    fireEvent.error(screen.getByRole("img", { name: "First" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Image failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
