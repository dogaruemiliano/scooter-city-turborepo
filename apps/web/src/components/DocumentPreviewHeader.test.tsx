import { DocumentPreviewHeader } from "@repo/ui/components/document-preview-header";
import { motion } from "@repo/theme";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const name = "Scooter registration certificate with a very long filename.pdf";
let width: number;
let measure: ResizeObserverCallback;
let animate: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  width = 200;
  cancel = vi.fn();
  animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(600);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("shared document overlay header", () => {
  it("only shows a close control when a close callback is supplied", () => {
    const onClosePress = vi.fn();
    const { rerender } = render(
      <DocumentPreviewHeader caption={name} closeLabel="Close" />,
    );
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    rerender(
      <DocumentPreviewHeader
        caption={name}
        closeLabel="Close"
        onClosePress={onClosePress}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClosePress).toHaveBeenCalledOnce();
  });

  it("scrolls overflowing filenames across their full width and remeasures on resize", () => {
    const { container, unmount } = render(
      <DocumentPreviewHeader caption={name} />,
    );
    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([{ transform: "translateX(-400px)", offset: 1 }]),
      expect.objectContaining({
        duration: motion.duration.documentNameScroll,
        direction: "alternate",
        iterations: Infinity,
      }),
    );
    expect(
      container.querySelector('[data-slot="document-zoom-caption"]'),
    ).toHaveAttribute("tabindex", "0");
    width = 800;
    act(() => measure([], {} as ResizeObserver));
    expect(cancel).toHaveBeenCalled();
    expect(
      container.querySelector('[data-slot="document-zoom-caption"]'),
    ).toHaveAttribute("data-scrolling", "false");
    unmount();
  });

  it("keeps names still when they fit", () => {
    width = 800;
    render(<DocumentPreviewHeader caption={name} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("stops automatic movement for pointer and keyboard inspection", () => {
    render(<DocumentPreviewHeader caption={name} />);
    const caption = screen.getByTitle(name);
    fireEvent.pointerEnter(caption);
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.pointerLeave(caption);
    expect(animate).toHaveBeenCalledTimes(2);
    fireEvent.focus(caption);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(caption).toHaveAttribute("data-scrolling", "false");
  });

  it("honors reduced motion and leaves the filename manually scrollable", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<DocumentPreviewHeader caption={name} />);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByTitle(name)).toHaveAttribute("tabindex", "0");
  });
});
