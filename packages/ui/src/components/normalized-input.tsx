"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "./input";

export interface NormalizedInputProps extends Omit<
  ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "type"
> {
  value: string;
  onValueChange: (value: string) => void;
  normalize: (value: string) => string;
}

/** Normalize the actual value, including paste, while preserving the caret. */
export function NormalizedInput({
  value,
  onValueChange,
  normalize,
  ref,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: NormalizedInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);
  const selection = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    if (selection.current && inputRef.current === document.activeElement) {
      inputRef.current?.setSelectionRange(
        selection.current.start,
        selection.current.end,
      );
    }
    selection.current = null;
  });
  function update(input: HTMLInputElement) {
    const raw = input.value;
    const next = composing.current ? raw : normalize(raw);
    if (next !== raw && input.selectionStart !== null) {
      selection.current = {
        start: normalize(raw.slice(0, input.selectionStart)).length,
        end: normalize(raw.slice(0, input.selectionEnd ?? input.selectionStart))
          .length,
      };
    }
    onValueChange(next);
    // Replacing an already-normalized separator can leave the controlled value
    // unchanged, so React won't render. Restore the DOM and caret in that case.
    if (next === value && selection.current) {
      input.value = next;
      input.setSelectionRange(selection.current.start, selection.current.end);
      selection.current = null;
    }
  }
  return (
    <Input
      {...props}
      type="text"
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === "function") return ref(node);
        if (ref) ref.current = node;
      }}
      value={composing.current ? value : normalize(value)}
      onChange={(event) => update(event.currentTarget)}
      onCompositionStart={(event) => {
        composing.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        update(event.currentTarget);
        onCompositionEnd?.(event);
      }}
    />
  );
}
