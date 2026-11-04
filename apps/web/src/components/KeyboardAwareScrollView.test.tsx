import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spacing } from "@repo/theme";
import { KeyboardAwareScrollView } from "@repo/ui/components/keyboard-aware-scroll-view";

function rect(top: number, bottom: number) {
  return {
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 390,
    width: 390,
    x: 0,
    y: top,
    toJSON() {},
  } as DOMRect;
}

function setup({
  top = 600,
  bottom = 660,
  width = 390,
  style = {},
  containerHeight = 720,
  activityButton = false,
  secondInput = false,
} = {}) {
  const visual = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
    pageTop: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", visual);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("scrollBy", vi.fn());
  vi.stubGlobal("scrollY", 0);
  const ref = createRef<HTMLDivElement>();
  const onFocusCapture = vi.fn();
  const onBlurCapture = vi.fn();
  const onScroll = vi.fn();
  const view = render(
    <KeyboardAwareScrollView
      ref={ref}
      data-slot="app-page-scroll"
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      onScroll={onScroll}
      style={style}
    >
      {activityButton ? <button type="button">Activity</button> : null}
      <textarea aria-label="Comment" />
      {secondInput ? <input aria-label="Title" /> : null}
    </KeyboardAwareScrollView>,
  );
  const scroll = ref.current!;
  const input = screen.getByRole("textbox", { name: "Comment" });
  scroll.getBoundingClientRect = () => {
    const maximum = parseFloat(scroll.style.maxHeight);
    const scrollportTop = 80 - window.scrollY;
    return rect(
      scrollportTop,
      scrollportTop +
        Math.min(
          containerHeight,
          Number.isFinite(maximum) ? maximum : Infinity,
        ),
    );
  };
  input.getBoundingClientRect = () => rect(top, bottom);
  scroll.scrollBy = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options === "object") scroll.scrollTop += options.top ?? 0;
  });
  const focus = () => fireEvent.focusIn(input);
  const resize = (height: number) =>
    act(() => {
      visual.height = height;
      visual.dispatchEvent(new Event("resize"));
    });
  return {
    ...view,
    scroll,
    input,
    visual,
    focus,
    resize,
    onFocusCapture,
    onBlurCapture,
    onScroll,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KeyboardAwareScrollView", () => {
  it("constrains only the existing scrollport and leaves focus scrolling to the browser", () => {
    const { scroll, focus, resize, input } = setup();
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe("370px");
    expect(scroll).toHaveAttribute("data-keyboard-open", "true");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();
    expect(scroll.children).toHaveLength(1);
    expect(input.parentElement).toBe(scroll);
    expect(scroll.style.padding).toBe("");
    expect(scroll.style.paddingTop).toBe("");
    expect(scroll.style.paddingBottom).toBe("");
    expect(scroll.style.margin).toBe("");
    expect(scroll.style.position).toBe("");
    expect(scroll).toHaveAttribute("data-slot", "app-page-scroll");
  });

  it("does not disturb an already-visible input or the browser's scroll position", () => {
    const { scroll, focus, resize } = setup({ top: 200, bottom: 260 });
    scroll.scrollTop = 120;
    focus();
    resize(450);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(scroll.scrollTop).toBe(120);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it("does not force a scroll for a control above the scrollport", () => {
    const { scroll, focus, resize } = setup({ top: 60, bottom: 120 });
    scroll.scrollTop = 200;
    focus();
    resize(450);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(scroll.scrollTop).toBe(200);
  });

  it("keeps native scrolling and viewport panning intact without adding another reveal loop", () => {
    const { scroll, input, visual, focus, resize } = setup();
    const reveal = vi.spyOn(input, "scrollIntoView");
    const observer = vi.fn();
    vi.stubGlobal("ResizeObserver", observer);
    scroll.scrollTop = 260;
    focus();
    resize(450);

    // Model the browser's own focus scroll after its software keyboard opens.
    scroll.scrollTop = 380;
    fireEvent.scroll(scroll);
    act(() => visual.dispatchEvent(new Event("scroll")));
    expect(scroll.scrollTop).toBe(380);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });

  it("captures the full pre-keyboard baseline after an Activity button blurs into the textarea", () => {
    const { scroll, input, focus, resize } = setup({ activityButton: true });
    const activity = screen.getByRole("button", { name: "Activity" });
    fireEvent.focusIn(activity);
    fireEvent.focusOut(activity, { relatedTarget: input });
    focus();

    // Safari can shrink innerHeight only after the textarea's focus event.
    vi.stubGlobal("innerHeight", 408);
    resize(408);
    expect(scroll).toHaveAttribute("data-keyboard-open", "true");
    expect(scroll.style.maxHeight).toBe("328px");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });

  it("keeps the original baseline when focus moves directly between text controls", () => {
    const { scroll, input, focus, resize } = setup({ secondInput: true });
    const next = screen.getByRole("textbox", { name: "Title" });
    focus();
    vi.stubGlobal("innerHeight", 450);
    resize(450);
    expect(scroll.style.maxHeight).toBe("370px");

    fireEvent.focusOut(input, { relatedTarget: next });
    fireEvent.focusIn(next);
    expect(scroll).toHaveAttribute("data-keyboard-open", "true");
    expect(scroll.style.maxHeight).toBe("370px");
    vi.stubGlobal("innerHeight", 600);
    resize(600);
    expect(scroll.style.maxHeight).toBe("520px");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });

  it("normalizes Safari panning against pageTop and window scroll before applying BCR coordinates", () => {
    const { scroll, visual, focus, resize } = setup();
    focus();
    scroll.scrollTop = 380;
    vi.stubGlobal("innerHeight", 408);
    vi.stubGlobal("scrollY", 403);
    visual.offsetTop = 403;
    visual.pageTop = 403;
    resize(300);

    // BCR top is already 80 - 403 = -323; the visible top is 403 - 403 = 0.
    // Available height is therefore 300 - (-323), not offsetTop + 300 + 323.
    expect(scroll).toHaveAttribute("data-keyboard-open", "true");
    expect(scroll.style.maxHeight).toBe("623px");
    expect(scroll.scrollTop).toBe(380);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it("restores caller sizing on keyboard dismissal without resetting scroll position", () => {
    const { scroll, focus, resize } = setup({
      top: 200,
      bottom: 260,
      style: { maxHeight: spacing[96] },
    });
    scroll.scrollTop = 120;
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe("370px");
    resize(800);
    expect(scroll.style.maxHeight).toBe(`${spacing[96]}px`);
    expect(scroll).not.toHaveAttribute("data-keyboard-open");
    expect(scroll.scrollTop).toBe(120);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });

  it("does not enlarge a caller's smaller max-height while the keyboard is open", () => {
    const { scroll, focus, resize } = setup({
      top: 160,
      bottom: 220,
      style: { maxHeight: spacing[48] },
    });
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe(`${spacing[48]}px`);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
    resize(600);
    expect(scroll.style.maxHeight).toBe(`${spacing[48]}px`);
    resize(800);
    expect(scroll.style.maxHeight).toBe(`${spacing[48]}px`);
  });

  it("respects a max-height supplied by a caller's CSS class", () => {
    const { scroll, focus, resize } = setup({ top: 160, bottom: 220 });
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const computed = getStyle(element);
      if (element === scroll) computed.maxHeight = `${spacing[48]}px`;
      return computed;
    });
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe(`${spacing[48]}px`);
  });

  it("never grows beyond the scrollport's original available height", () => {
    const { scroll, focus, resize } = setup({
      top: 160,
      bottom: 220,
      containerHeight: spacing[70],
    });
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe(`${spacing[70]}px`);
  });

  it("can grow again during partial keyboard dismissal using the original size limit", () => {
    const { scroll, focus, resize } = setup({ top: 160, bottom: 220 });
    focus();
    resize(450);
    expect(scroll.style.maxHeight).toBe("370px");
    resize(600);
    expect(scroll.style.maxHeight).toBe("520px");
  });

  it("restores normal sizing on blur and preserves caller handlers and the same scroll node", () => {
    const {
      scroll,
      input,
      focus,
      resize,
      onFocusCapture,
      onBlurCapture,
      onScroll,
    } = setup({ top: 200, bottom: 260 });
    focus();
    resize(450);
    fireEvent.scroll(scroll);
    fireEvent.focusOut(input, { relatedTarget: document.body });
    expect(scroll.style.maxHeight).toBe("");
    expect(scroll).not.toHaveAttribute("data-keyboard-open");
    expect(onFocusCapture).toHaveBeenCalledOnce();
    expect(onBlurCapture).toHaveBeenCalledOnce();
    expect(onScroll).toHaveBeenCalledOnce();
    expect(input.parentElement).toBe(scroll);
  });

  it.each([
    { name: "browser chrome", height: 766, scale: 1, width: 390 },
    {
      name: "a hardware-keyboard accessory bar",
      height: 742,
      scale: 1,
      width: 390,
    },
    { name: "pinch zoom", height: 450, scale: 2, width: 390 },
    { name: "a desktop viewport", height: 450, scale: 1, width: 1280 },
  ])("ignores $name", ({ height, scale, width }) => {
    const { scroll, visual, focus, resize } = setup({ width });
    focus();
    visual.scale = scale;
    resize(height);
    expect(scroll.style.maxHeight).toBe("");
    expect(scroll).not.toHaveAttribute("data-keyboard-open");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });

  it("works when Android resizes both the layout and visual viewport", () => {
    const { scroll, focus, resize } = setup();
    focus();
    vi.stubGlobal("innerHeight", 450);
    resize(450);
    expect(scroll.style.maxHeight).toBe("370px");
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });

  it("removes viewport listeners on unmount", () => {
    const { visual, focus, resize, unmount, scroll } = setup();
    const remove = vi.spyOn(visual, "removeEventListener");
    focus();
    resize(450);
    vi.mocked(scroll.scrollBy).mockClear();
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    resize(300);
    expect(scroll.scrollBy).not.toHaveBeenCalled();
  });
});
