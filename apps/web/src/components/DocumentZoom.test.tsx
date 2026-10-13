import { DocumentZoom } from "@repo/ui/components/document-zoom";
import { magnification, motion, spacing } from "@repo/theme";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
};
afterEach(() => vi.restoreAllMocks());

function setup() {
  const result = render(
    <DocumentZoom labels={labels}>{() => <span>Document</span>}</DocumentZoom>,
  );
  const viewport = result.container.querySelector<HTMLElement>(
    '[data-slot="document-zoom-viewport"]',
  )!;
  Object.defineProperties(viewport, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 50,
    width: 800,
    height: 600,
  } as DOMRect);
  return {
    ...result,
    viewport,
    content: viewport.firstElementChild as HTMLElement,
  };
}

function pointer(
  viewport: HTMLElement,
  type: string,
  timeStamp: number,
  init: PointerEventInit = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: 300,
    clientY: 200,
    ...init,
  });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "touch" },
    timeStamp: { value: timeStamp },
  });
  fireEvent(viewport, event);
}

function tap(viewport: HTMLElement, timeStamp: number) {
  pointer(viewport, "pointerdown", timeStamp);
  pointer(viewport, "pointerup", timeStamp + 10);
  pointer(viewport, "lostpointercapture", timeStamp + 11);
}

function nativeDoubleClick(
  viewport: HTMLElement,
  timeStamp: number,
  clientX = 300,
  clientY = 200,
) {
  const event = new MouseEvent("dblclick", {
    bubbles: true,
    detail: 2,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  fireEvent(viewport, event);
}

function doubleClick(
  viewport: HTMLElement,
  clientX = 300,
  clientY = 200,
  timeStamp = Date.now(),
) {
  const init = { pointerType: "mouse", clientX, clientY };
  pointer(viewport, "pointerdown", timeStamp, init);
  pointer(viewport, "pointerup", timeStamp + 10, init);
  pointer(viewport, "pointerdown", timeStamp + 40, init);
  pointer(viewport, "pointerup", timeStamp + 50, init);
  nativeDoubleClick(viewport, timeStamp + 50, clientX, clientY);
}

function zoomTo(scale: number) {
  for (let current = 1; current < scale; current += magnification.documentStep)
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
}

describe("shared document focal-point zoom", () => {
  it.each([
    [300, 200, 200, 150],
    [700, 500, -200, -150],
    [100, 50, 400, 300],
    [900, 650, -400, -300],
    [500, 350, 0, 0],
  ])(
    "keeps the document point at (%i, %i) under the pointer",
    (clientX, clientY, x, y) => {
      const { viewport, content } = setup();
      doubleClick(viewport, clientX, clientY);
      expect(viewport).toHaveAttribute("data-zoom", "2");
      expect(content.style.transform).toBe(
        `translate(${x}px, ${y}px) scale(2)`,
      );
      // Check the original document point still maps to the same screen point.
      expect(100 + 400 + x + (clientX - 100 - 400) * 2).toBe(clientX);
      expect(50 + 300 + y + (clientY - 50 - 300) * 2).toBe(clientY);
    },
  );

  it("retains zoom on rerender and smoothly returns to 100% on the next double click", () => {
    const { viewport, content, rerender } = setup();
    doubleClick(viewport);
    rerender(
      <DocumentZoom labels={{ ...labels }}>
        {() => <span>Document</span>}
      </DocumentZoom>,
    );
    expect(viewport).toHaveAttribute("data-zoom", "2");
    doubleClick(viewport, 700, 500);
    expect(viewport).toHaveAttribute("data-zoom", "1");
    expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(content).toHaveClass("transition-transform", "duration-fast");
  });

  it("zooms in and back out with touch double taps without a native double click", () => {
    const { viewport, content } = setup();
    tap(viewport, 100);
    pointer(viewport, "pointerdown", 120, { pointerType: "mouse" });
    pointer(viewport, "pointerup", 130, { pointerType: "mouse" });
    expect(viewport).toHaveAttribute("data-zoom", "1");
    tap(viewport, 200);
    expect(viewport).toHaveAttribute("data-zoom", "2");
    expect(content.style.transform).toBe("translate(200px, 150px) scale(2)");
    expect(content).toHaveClass("transition-transform", "duration-fast");
    tap(viewport, 700);
    tap(viewport, 800);
    expect(viewport).toHaveAttribute("data-zoom", "1");
    expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("ignores compatibility mouse events following a touch double tap", () => {
    const { viewport, content } = setup();
    tap(viewport, 100);
    tap(viewport, 200);
    pointer(viewport, "pointerdown", 220, { pointerType: "mouse" });
    pointer(viewport, "pointerup", 230, { pointerType: "mouse" });
    for (const timeStamp of [240, 250]) {
      const event = new MouseEvent("dblclick", {
        bubbles: true,
        clientX: 300,
        clientY: 200,
      });
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
      fireEvent(viewport, event);
    }
    expect(viewport).toHaveAttribute("data-zoom", "2");
    expect(content).toHaveClass("transition-transform");
  });

  it.each([1, magnification.documentMax])(
    "handles duplicate native events once when starting at %sx zoom",
    (scale) => {
      const { viewport, content } = setup();
      zoomTo(scale);
      doubleClick(viewport, 300, 200, 100);
      const expected = scale > 1 ? "1" : "2";
      expect(viewport).toHaveAttribute("data-zoom", expected);
      // Some compatibility events arrive after the double-tap time window.
      nativeDoubleClick(viewport, 600);
      expect(viewport).toHaveAttribute("data-zoom", expected);
      if (scale > 1)
        expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
      doubleClick(viewport, 300, 200, 700);
      expect(viewport).toHaveAttribute("data-zoom", scale > 1 ? "2" : "1");
    },
  );

  it("keeps a touch reset from 400% at 100% after a delayed native double click", () => {
    const { viewport, content } = setup();
    zoomTo(magnification.documentMax);
    tap(viewport, 100);
    tap(viewport, 200);
    expect(viewport).toHaveAttribute("data-zoom", "1");
    nativeDoubleClick(viewport, 211 + motion.duration.doubleTap);
    expect(viewport).toHaveAttribute("data-zoom", "1");
    expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it.each(["drag", "pinch", "cancel", "hold", "distant", "late"])(
    "does not treat a %s gesture as a double tap",
    (gesture) => {
      const { viewport } = setup();
      tap(viewport, 100);
      const startedAt =
        gesture === "late" ? 200 + motion.duration.doubleTap : 200;
      const init = gesture === "distant" ? { clientX: 300 + spacing[10] } : {};
      pointer(viewport, "pointerdown", startedAt, init);
      if (gesture === "drag")
        pointer(viewport, "pointermove", 210, { clientX: 300 + spacing[4] });
      if (gesture === "pinch") {
        pointer(viewport, "pointerdown", 210, { pointerId: 2 });
        pointer(viewport, "pointerup", 220, { pointerId: 2 });
      }
      pointer(
        viewport,
        gesture === "cancel" ? "pointercancel" : "pointerup",
        startedAt + 30 + (gesture === "hold" ? motion.duration.doubleTap : 0),
        init,
      );
      expect(viewport).toHaveAttribute("data-zoom", "1");
    },
  );

  it("animates discrete zoom actions and disables animation for dragging", () => {
    const { viewport, content } = setup();
    doubleClick(viewport);
    expect(content).toHaveClass(
      "transition-transform",
      "duration-fast",
      "ease-decelerate",
      "motion-reduce:transition-none",
    );
    pointer(viewport, "pointerdown", 100, { pointerType: "mouse" });
    // A stationary press must not interrupt the discrete zoom animation.
    expect(content).toHaveClass("transition-transform");
    pointer(viewport, "pointermove", 105, { pointerType: "mouse" });
    expect(content).toHaveClass("transition-transform");
    pointer(viewport, "pointermove", 110, {
      pointerType: "mouse",
      clientX: 320,
    });
    expect(content).toHaveClass("transition-none");
    pointer(viewport, "pointerup", 120, { pointerType: "mouse" });
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(content).toHaveClass("transition-transform");
    expect(viewport).toHaveAttribute("data-zoom", "1");
  });

  it.each([1.5, 2, 3, magnification.documentMax])(
    "returns a toolbar-selected %sx zoom level directly to 100% on double click",
    (scale) => {
      const { viewport, content } = setup();
      zoomTo(scale);
      expect(viewport).toHaveAttribute("data-zoom", String(scale));
      doubleClick(viewport);
      expect(viewport).toHaveAttribute("data-zoom", "1");
      expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
    },
  );

  it("clears focal offsets through the reset control and when the PDF page changes", () => {
    const { viewport, content, rerender } = setup();
    doubleClick(viewport);
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
    doubleClick(viewport, 700, 500);
    rerender(
      <DocumentZoom labels={labels} resetKey={2}>
        {() => <span>Next page</span>}
      </DocumentZoom>,
    );
    expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
  });
});
