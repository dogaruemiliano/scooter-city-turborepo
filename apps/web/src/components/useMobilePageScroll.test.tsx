import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePageScroll } from "./useMobilePageScroll";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("@repo/ui/hooks/use-mobile", () => ({
  useIsMobile: () => viewport.mobile,
}));

function Page({
  pathname,
  enabled = true,
}: {
  pathname: string;
  enabled?: boolean;
}) {
  const [scrollRef, onScroll] = useMobilePageScroll(pathname, enabled);
  return enabled ? (
    <div data-testid="scroll" ref={scrollRef} onScroll={onScroll}>
      Content
    </div>
  ) : (
    <div>Standalone page</div>
  );
}
beforeEach(() => {
  viewport.mobile = true;
  window.history.replaceState({}, "", "/one");
});

describe("mobile page scrolling", () => {
  it("starts new routes at the top and restores back/forward positions", () => {
    const { rerender } = render(<Page pathname="/one" />);
    const content = screen.getByTestId("scroll");
    fireEvent.scroll(content, { target: { scrollTop: 240 } });
    rerender(<Page pathname="/two" />);
    expect(content.scrollTop).toBe(0);
    fireEvent.scroll(content, { target: { scrollTop: 120 } });
    window.history.replaceState({}, "", "/one");
    fireEvent.popState(window);
    rerender(<Page pathname="/one" />);
    expect(content.scrollTop).toBe(240);
    window.history.replaceState({}, "", "/two");
    fireEvent.popState(window);
    rerender(<Page pathname="/two" />);
    expect(content.scrollTop).toBe(120);
    rerender(<Page pathname="/one" />);
    expect(content.scrollTop).toBe(0);
  });

  it("preserves a route's scroll while its form updates", () => {
    const { rerender } = render(<Page pathname="/one" />);
    const content = screen.getByTestId("scroll");
    fireEvent.scroll(content, { target: { scrollTop: 240 } });
    rerender(<Page pathname="/one" />);
    expect(content.scrollTop).toBe(240);
  });

  it("restores scroll after returning from a standalone route", () => {
    const { rerender } = render(<Page pathname="/one" />);
    fireEvent.scroll(screen.getByTestId("scroll"), {
      target: { scrollTop: 240 },
    });
    rerender(<Page pathname="/immersive" enabled={false} />);
    window.history.replaceState({}, "", "/one");
    fireEvent.popState(window);
    rerender(<Page pathname="/one" />);
    expect(screen.getByTestId("scroll").scrollTop).toBe(240);
  });

  it("leaves desktop scrolling to the browser", () => {
    viewport.mobile = false;
    const { rerender } = render(<Page pathname="/one" />);
    const content = screen.getByTestId("scroll");
    fireEvent.scroll(content, { target: { scrollTop: 240 } });
    rerender(<Page pathname="/two" />);
    expect(content.scrollTop).toBe(240);
  });
});
