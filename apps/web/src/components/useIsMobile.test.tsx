import { act, renderHook } from "@testing-library/react";
import { tokens } from "@repo/theme";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let matches = false;
let mediaQuery: MediaQueryList;

beforeEach(() => {
  matches = false;
  mediaQuery = new EventTarget() as MediaQueryList;
  Object.defineProperty(mediaQuery, "matches", { get: () => matches });
  vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);
});

afterEach(() => vi.restoreAllMocks());

describe("useIsMobile", () => {
  it("uses the CSS media query on the first client render", () => {
    matches = true;
    const committedValues: boolean[] = [];
    renderHook(() => {
      const mobile = useIsMobile();
      useLayoutEffect(() => {
        committedValues.push(mobile);
      }, [mobile]);
      return mobile;
    });
    expect(committedValues).toEqual([true]);
    expect(window.matchMedia).toHaveBeenCalledWith(
      `(width < ${tokens.breakpoints.md}px)`,
    );
  });

  it("follows media query changes in both directions", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      matches = true;
      mediaQuery.dispatchEvent(new Event("change"));
    });
    expect(result.current).toBe(true);
    act(() => {
      matches = false;
      mediaQuery.dispatchEvent(new Event("change"));
    });
    expect(result.current).toBe(false);
  });

  it.each(["popstate", "pageshow", "resize"])(
    "rechecks the viewport on %s even without a media change event",
    (event) => {
      const { result } = renderHook(() => useIsMobile());
      act(() => {
        matches = true;
        window.dispatchEvent(new Event(event));
      });
      expect(result.current).toBe(true);
    },
  );

  it("removes subscriptions when unmounted", () => {
    const removeMediaListener = vi.spyOn(mediaQuery, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(removeMediaListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    for (const event of ["popstate", "pageshow", "resize"]) {
      expect(removeWindowListener).toHaveBeenCalledWith(
        event,
        expect.any(Function),
      );
    }
  });
});
