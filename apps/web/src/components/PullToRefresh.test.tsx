import { fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@repo/theme";
import {
  PullToRefresh,
  type PullToRefreshProps,
} from "@repo/ui/components/pull-to-refresh";

const labels = {
  pull: "Pull to refresh",
  release: "Release to refresh",
  refreshing: "Refreshing…",
  refresh: "Refresh page data",
};
let mobile = true;
beforeEach(() => {
  mobile = true;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

function renderControl(props: Partial<PullToRefreshProps> = {}) {
  const onRefresh = vi.fn();
  const view = (overrides = props) => (
    <div data-testid="scrollport">
      <PullToRefresh
        labels={labels}
        refreshing={false}
        onRefresh={onRefresh}
        {...overrides}
      >
        <p>Existing data</p>
        <input aria-label="Search" />
        <div style={{ overflowX: "auto" }}>
          <span>Photo rail</span>
        </div>
        <div style={{ overflowY: "auto" }}>
          <span>Nested scroll</span>
        </div>
        <div data-pull-to-refresh-ignore>
          <span>Other gesture owner</span>
        </div>
        {createPortal(<div role="dialog">Sheet content</div>, document.body)}
      </PullToRefresh>
    </div>
  );
  const result = render(view());
  return {
    ...result,
    onRefresh,
    scrollport: screen.getByTestId("scrollport"),
    rerenderControl: (overrides: Partial<PullToRefreshProps>) =>
      result.rerender(view(overrides)),
  };
}

const touch = (x: number, y: number, identifier = 1) => ({
  clientX: x,
  clientY: y,
  identifier,
});
function start(target: Element) {
  fireEvent.touchStart(target, { touches: [touch(20, 20)] });
}
function move(target: Element, y: number, x = 20) {
  return fireEvent.touchMove(target, { touches: [touch(x, 20 + y)] });
}
function end(target: Element) {
  fireEvent.touchEnd(target, { touches: [] });
}
function pull(target: Element) {
  start(target);
  move(target, tokens.motion.gesture.pullToRefresh.threshold);
  end(target);
}

describe("mobile pull-to-refresh", () => {
  it.each([false, true])(
    "keeps the reveal closed for initial and background loading (initially loading: %s)",
    (refreshing) => {
      const control = renderControl({ refreshing });
      const reveal = control.container.querySelector(
        '[data-slot="pull-to-refresh-reveal"]',
      )!;
      const content = screen.getByText("Existing data");
      const button = screen.getByRole("button", { name: labels.refresh });
      expect(reveal).toHaveStyle({ height: "0px" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      control.rerenderControl({ refreshing: true });
      pull(content);
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(control.onRefresh).not.toHaveBeenCalled();
      expect(content).toBeVisible();
      expect(reveal).toHaveStyle({ height: "0px" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      control.rerenderControl({ refreshing: false });
      expect(button).toBeEnabled();
      expect(reveal).toHaveStyle({ height: "0px" });
      pull(content);
      expect(control.onRefresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(labels.refreshing);
    },
  );

  it("does not reopen for background loading after an explicit refresh finishes", () => {
    const control = renderControl();
    const reveal = control.container.querySelector(
      '[data-slot="pull-to-refresh-reveal"]',
    )!;
    pull(screen.getByText("Existing data"));
    control.rerenderControl({ refreshing: true });
    expect(screen.getByRole("status")).toHaveTextContent(labels.refreshing);
    control.rerenderControl({ refreshing: false });
    control.rerenderControl({ refreshing: true });
    expect(reveal).toHaveStyle({ height: "0px" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("spins from the first pull movement through release without replacing the fixed indicator", () => {
    const control = renderControl();
    const reveal = control.container.querySelector(
      '[data-slot="pull-to-refresh-reveal"]',
    )!;
    const spinner = control.container.querySelector(
      '[data-slot="pull-to-refresh-spinner"]',
    )!;
    expect(reveal).toHaveStyle({ height: "0px" });
    expect(spinner).toHaveClass("absolute", "top-0");
    expect(spinner).toHaveStyle({
      height: `${tokens.motion.gesture.pullToRefresh.maxTravel}px`,
    });
    const content = screen.getByText("Existing data");
    start(content);
    move(content, tokens.motion.gesture.pullToRefresh.axisLockDistance);
    const indicator = spinner.querySelector('[data-slot="spinner"]')!;
    expect(indicator).toHaveClass("animate-spin", "motion-reduce:animate-none");
    expect(indicator).not.toHaveClass("animate-none");
    move(content, tokens.motion.gesture.pullToRefresh.threshold);
    expect(
      Number.parseFloat((reveal as HTMLElement).style.height),
    ).toBeGreaterThan(0);
    expect(
      control.container.querySelector('[data-slot="pull-to-refresh-spinner"]'),
    ).toBe(spinner);
    expect(screen.getByText(labels.release)).toHaveClass("sr-only");
    expect(indicator).toHaveClass("animate-spin");
    expect(indicator).not.toHaveClass("animate-none");
    end(content);
    expect(spinner.querySelector('[data-slot="spinner"]')).toBe(indicator);
    expect(indicator).toHaveClass("animate-spin");
    expect(indicator).not.toHaveClass("animate-none");
  });

  it("holds the reveal open until loading settles, then animates content back over the spinning indicator", () => {
    const control = renderControl();
    const content = screen.getByText("Existing data");
    const reveal = control.container.querySelector(
      '[data-slot="pull-to-refresh-reveal"]',
    )!;
    const indicator = reveal.querySelector('[data-slot="spinner"]')!;
    const loadingHeight = {
      height: `${tokens.motion.gesture.pullToRefresh.maxTravel}px`,
    };

    pull(content);
    // Reserve space immediately, even before the request reports loading.
    expect(reveal).toHaveStyle(loadingHeight);
    expect(screen.getByRole("status")).toHaveTextContent(labels.refreshing);
    control.rerenderControl({ refreshing: true });
    pull(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveStyle(loadingHeight);
    expect(indicator).not.toHaveClass("animate-none");

    control.rerenderControl({ refreshing: false });
    expect(reveal).toHaveStyle({ height: "0px" });
    expect(reveal).toHaveClass(
      "transition-[height]",
      "duration-slow",
      "ease-decelerate",
      "motion-reduce:transition-none",
    );
    expect(reveal).not.toHaveClass("transition-none");
    expect(reveal.querySelector('[data-slot="spinner"]')).toBe(indicator);
    expect(indicator).toHaveClass("animate-spin");
    expect(indicator).not.toHaveClass("animate-none");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["touchEnd", "touchCancel"] as const)(
    "animates an uncommitted pull closed on %s while the indicator keeps spinning",
    (event) => {
      const control = renderControl();
      const content = screen.getByText("Existing data");
      const reveal = control.container.querySelector(
        '[data-slot="pull-to-refresh-reveal"]',
      )!;
      start(content);
      move(content, tokens.motion.gesture.pullToRefresh.axisLockDistance);
      expect(reveal).toHaveClass("transition-none");
      fireEvent[event](content, { touches: [] });
      expect(reveal).toHaveStyle({ height: "0px" });
      expect(reveal).toHaveClass("transition-[height]", "duration-slow");
      expect(reveal).not.toHaveClass("transition-none");
      expect(reveal.querySelector('[data-slot="spinner"]')).not.toHaveClass(
        "animate-none",
      );
      expect(control.onRefresh).not.toHaveBeenCalled();
    },
  );

  it("arms at the threshold, commits on release once, and waits for the controlled request", () => {
    const control = renderControl();
    const content = screen.getByText("Existing data");
    start(content);
    expect(
      move(content, tokens.motion.gesture.pullToRefresh.axisLockDistance),
    ).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(labels.pull);
    move(content, tokens.motion.gesture.pullToRefresh.threshold);
    expect(screen.getByRole("status")).toHaveTextContent(labels.release);
    expect(control.onRefresh).not.toHaveBeenCalled();
    end(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(labels.refreshing);
    pull(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
    control.rerenderControl({ refreshing: true });
    expect(screen.getByText("Existing data")).toBeVisible();
    pull(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
    control.rerenderControl({ refreshing: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    pull(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(2);
  });

  it("allows a keyboard refresh on mobile", () => {
    const control = renderControl();
    fireEvent.click(screen.getByRole("button", { name: labels.refresh }));
    fireEvent.click(screen.getByRole("button", { name: labels.refresh }));
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each(["desktop", "disabled", "not enabled"])(
    "does not intercept gestures when %s",
    (state) => {
      mobile = state !== "desktop";
      const control = renderControl({
        disabled: state === "disabled",
        enabled: state !== "not enabled",
      });
      const content = screen.getByText("Existing data");
      start(content);
      expect(move(content, tokens.motion.gesture.pullToRefresh.threshold)).toBe(
        true,
      );
      end(content);
      expect(control.onRefresh).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      if (state !== "disabled")
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("requires the gesture to start at the top, including short and empty scrollports", () => {
    const control = renderControl();
    control.scrollport.scrollTop = tokens.spacing[4];
    const content = screen.getByText("Existing data");
    start(content);
    control.scrollport.scrollTop = 0;
    move(content, tokens.motion.gesture.pullToRefresh.threshold);
    end(content);
    expect(control.onRefresh).not.toHaveBeenCalled();
    pull(content);
    expect(control.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("cancels short pulls, reversed pulls, horizontal swipes, scrolling and touchcancel", () => {
    const control = renderControl();
    const content = screen.getByText("Existing data");
    start(content);
    move(content, tokens.spacing[4]);
    end(content);
    start(content);
    move(content, tokens.motion.gesture.pullToRefresh.threshold);
    move(content, tokens.spacing[4]);
    end(content);
    start(content);
    move(content, tokens.spacing[4], tokens.spacing[32]);
    move(content, tokens.spacing[48]);
    end(content);
    start(content);
    move(content, -tokens.spacing[4]);
    move(content, tokens.spacing[48]);
    end(content);
    start(content);
    move(content, tokens.spacing[48]);
    fireEvent.touchCancel(content);
    end(content);
    start(content);
    control.scrollport.scrollTop = tokens.spacing[4];
    move(content, tokens.spacing[48]);
    end(content);
    expect(control.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leaves multi-touch, non-cancelable moves, nested scrollers, inputs and portalled sheets alone", () => {
    const control = renderControl();
    const content = screen.getByText("Existing data");
    fireEvent.touchStart(content, {
      touches: [touch(20, 20), touch(40, 20, 2)],
    });
    move(content, tokens.spacing[48]);
    end(content);
    start(content);
    fireEvent.touchMove(content, {
      touches: [touch(20, 200), touch(40, 200, 2)],
    });
    move(content, tokens.spacing[48]);
    end(content);
    start(content);
    fireEvent.touchMove(content, {
      cancelable: false,
      touches: [touch(20, 200)],
    });
    end(content);
    for (const target of [
      screen.getByLabelText("Search"),
      screen.getByText("Photo rail"),
      screen.getByText("Nested scroll"),
      screen.getByText("Other gesture owner"),
      screen.getByText("Sheet content"),
    ])
      pull(target);
    expect(control.onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
