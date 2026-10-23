"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@repo/ui/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex max-w-full w-fit items-center justify-start overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden rounded-lg p-1 text-muted-foreground group-data-horizontal/tabs:h-12 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:overflow-x-visible md:group-data-horizontal/tabs:h-11 data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ref,
  style,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useImperativeHandle(ref, () => listRef.current!);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const horizontal =
        list.closest('[data-slot="tabs"]')?.getAttribute("data-orientation") !==
        "vertical";
      // RTL browsers use negative scrollLeft; convert it to physical edges.
      const rtl = getComputedStyle(list).direction === "rtl";
      const remaining = Math.max(0, list.scrollWidth - list.clientWidth);
      const left = rtl ? remaining + list.scrollLeft : list.scrollLeft;
      const next = {
        left: horizontal && left > 1,
        right: horizontal && remaining - left > 1,
      };
      setEdges((current) =>
        current.left === next.left && current.right === next.right
          ? current
          : next,
      );
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(list);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(list);
      for (const child of list.children) resize.observe(child);
      update();
    };
    observeChildren();
    const mutation = new MutationObserver(observeChildren);
    mutation.observe(list, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      list.removeEventListener("scroll", update);
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  const edgeMask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent" : "currentColor"}, currentColor var(--spacing-6), currentColor calc(100% - var(--spacing-6)), ${edges.right ? "transparent" : "currentColor"})`
      : undefined;

  return (
    <TabsPrimitive.List
      ref={listRef}
      style={{ maskImage: edgeMask, WebkitMaskImage: edgeMask, ...style }}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full min-w-12 flex-1 items-center justify-center gap-2 rounded-md border border-transparent px-3 py-1 text-base font-medium whitespace-nowrap text-muted-foreground transition-all duration-fast ease-standard group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-disabled-foreground md:min-w-10 md:gap-1.5 md:px-2 md:text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 md:has-data-[icon=inline-end]:pr-1.5 md:has-data-[icon=inline-start]:pl-1.5 aria-disabled:pointer-events-none aria-disabled:text-disabled-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity after:duration-fast after:ease-standard group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-1 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
