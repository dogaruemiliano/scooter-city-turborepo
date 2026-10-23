"use client";

import * as React from "react";

import { Textarea } from "@repo/ui/components/textarea";
import { Input } from "@repo/ui/components/input";
import { SelectTrigger } from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex h-12 w-full min-w-0 items-center rounded-lg border border-input bg-control transition-colors duration-fast ease-standard outline-none has-[[data-slot=input-group-control]:disabled]:bg-disabled has-[[data-slot=input-group-control]:focus-visible]:border-border has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-border has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control][aria-invalid=true]]:ring-2 has-[[data-slot=input-group-control][aria-invalid=true]]:ring-destructive md:h-11",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent aria-invalid:border-transparent aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

/** Multiline control with the group's shared surface and focus ring. */
function InputGroupTextarea({
  className,
  autoResize = false,
  value,
  onChange,
  ...props
}: React.ComponentProps<"textarea"> & { autoResize?: boolean }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const resize = React.useCallback(() => {
    const input = ref.current;
    if (!autoResize || !input) return;
    input.style.height = "auto";
    const styles = getComputedStyle(input);
    const maximum = parseFloat(styles.maxHeight);
    const height = Number.isFinite(maximum)
      ? Math.min(input.scrollHeight, maximum)
      : input.scrollHeight;
    input.style.height = `${height}px`;
  }, [autoResize]);
  React.useLayoutEffect(resize, [resize, value]);
  React.useEffect(() => {
    const input = ref.current;
    if (!input || !autoResize || typeof ResizeObserver === "undefined") return;
    let previousWidth = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== previousWidth) {
        previousWidth = input.clientWidth;
        resize();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [autoResize, resize]);
  return (
    <Textarea
      ref={ref}
      data-slot="input-group-control"
      value={value}
      onChange={(event) => {
        onChange?.(event);
        resize();
      }}
      className={cn(
        "min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent aria-invalid:border-transparent aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        "flex h-full shrink-0 cursor-text items-center px-3 text-sm font-medium text-muted-foreground select-none",
        className,
      )}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, input")) return;
        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      data-slot="input-group-control"
      className={cn(
        "h-full w-24 flex-none rounded-none border-0 bg-transparent ring-0 focus-visible:border-transparent focus-visible:ring-0 aria-invalid:border-transparent aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupSelectTrigger,
};
