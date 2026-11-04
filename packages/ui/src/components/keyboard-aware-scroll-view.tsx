"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { breakpoints, spacing } from "@repo/theme";
import { cn } from "@repo/ui/lib/utils";

function textControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const control = target.closest<HTMLElement>(
    "input, textarea, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']",
  );
  if (
    control instanceof HTMLInputElement &&
    /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(
      control.type,
    )
  )
    return null;
  return control;
}

/** Resizes the scrollport for the keyboard; the browser owns focused-input scrolling. */
export function KeyboardAwareScrollView({
  ref,
  className,
  style,
  onFocusCapture,
  onBlurCapture,
  ...props
}: ComponentProps<"div">) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => scrollRef.current!, []);
  const beforeKeyboardHeight = useRef(0);
  const beforeKeyboardMaxHeight = useRef(Infinity);
  const [focused, setFocused] = useState<HTMLElement | null>(null);
  const [keyboardMaxHeight, setKeyboardMaxHeight] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const visual = window.visualViewport;
    const scroll = scrollRef.current;
    if (!focused || !visual || !scroll) {
      setKeyboardMaxHeight(null);
      return;
    }
    const update = () => {
      const keyboardHeight = Math.max(
        0,
        window.innerHeight - visual.height - visual.offsetTop,
        beforeKeyboardHeight.current - visual.height,
      );
      if (
        window.innerWidth >= breakpoints.md ||
        visual.scale !== 1 ||
        keyboardHeight < spacing.keyboardOpenThreshold
      ) {
        setKeyboardMaxHeight(null);
        return;
      }
      // Rects already include document scrolling. Safari can report that same
      // pan in offsetTop, so derive the visible edge in rect coordinates.
      const bottom = visual.pageTop - window.scrollY + visual.height;
      setKeyboardMaxHeight(
        Math.max(
          0,
          Math.min(
            beforeKeyboardMaxHeight.current,
            bottom - scroll.getBoundingClientRect().top,
          ),
        ),
      );
    };
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [focused]);

  return (
    <div
      data-slot="keyboard-aware-scroll-view"
      {...props}
      ref={scrollRef}
      data-keyboard-open={keyboardMaxHeight !== null ? true : undefined}
      className={cn("group/keyboard-aware min-h-0 overflow-y-auto", className)}
      style={
        keyboardMaxHeight !== null
          ? { ...style, maxHeight: keyboardMaxHeight }
          : style
      }
      onFocusCapture={(event) => {
        const control = textControl(event.target);
        if (control) {
          if (!focused) {
            beforeKeyboardHeight.current = window.innerHeight;
            const scroll = event.currentTarget;
            const height = scroll.getBoundingClientRect().height;
            const maximum = getComputedStyle(scroll).maxHeight;
            // Keep caller sizing (including class-based max-height) intact.
            // Capture before constraining so partial dismissal can grow again.
            beforeKeyboardMaxHeight.current = Math.min(
              height > 0 ? height : Infinity,
              /^\d*\.?\d+px$/.test(maximum) ? parseFloat(maximum) : Infinity,
            );
          }
          setFocused(control);
        }
        onFocusCapture?.(event);
      }}
      onBlurCapture={(event) => {
        // Focus initializes the session. A button's blur must not preassign
        // its next text field and skip the pre-keyboard measurements above.
        // Moving between text fields keeps the original measurements intact.
        if (
          !event.currentTarget.contains(event.relatedTarget) ||
          !textControl(event.relatedTarget)
        ) {
          setFocused(null);
        }
        onBlurCapture?.(event);
      }}
    />
  );
}
