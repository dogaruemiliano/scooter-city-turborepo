"use client";

import * as React from "react";
import { Drawer as BottomSheetPrimitive } from "@base-ui/react/drawer";

import { cn } from "@repo/ui/lib/utils";

type BottomSheetContextValue = {
  hasSnapPoints: boolean;
  modal: BottomSheetPrimitive.Root.Props["modal"];
  showHandle: boolean;
};

const BottomSheetContext = React.createContext<BottomSheetContextValue | null>(
  null,
);

function useBottomSheet() {
  const context = React.useContext(BottomSheetContext);

  if (!context) {
    throw new Error(
      "BottomSheet components must be rendered inside BottomSheet.",
    );
  }

  return context;
}

function BottomSheet({
  modal = true,
  showHandle = true,
  snapPoints,
  ...props
}: BottomSheetPrimitive.Root.Props & {
  showHandle?: boolean;
}) {
  const contextValue = React.useMemo(
    () => ({
      hasSnapPoints: snapPoints != null && snapPoints.length > 0,
      modal,
      showHandle,
    }),
    [modal, showHandle, snapPoints],
  );

  return (
    <BottomSheetContext.Provider value={contextValue}>
      <BottomSheetPrimitive.Root
        data-slot="bottom-sheet"
        modal={modal}
        snapPoints={snapPoints}
        swipeDirection="down"
        {...props}
      />
    </BottomSheetContext.Provider>
  );
}

function BottomSheetTrigger({ ...props }: BottomSheetPrimitive.Trigger.Props) {
  return (
    <BottomSheetPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />
  );
}

function BottomSheetPortal({ ...props }: BottomSheetPrimitive.Portal.Props) {
  return (
    <BottomSheetPrimitive.Portal data-slot="bottom-sheet-portal" {...props} />
  );
}

function BottomSheetClose({ ...props }: BottomSheetPrimitive.Close.Props) {
  return (
    <BottomSheetPrimitive.Close data-slot="bottom-sheet-close" {...props} />
  );
}

function BottomSheetOverlay({
  className,
  ...props
}: BottomSheetPrimitive.Backdrop.Props) {
  return (
    <BottomSheetPrimitive.Backdrop
      data-slot="bottom-sheet-overlay"
      className={cn(
        "fixed inset-0 z-overlay min-h-dvh bg-scrim opacity-[max(var(--bottom-sheet-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] transition-opacity duration-normal ease-standard select-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-snap-points:[--bottom-sheet-overlay-min-opacity:0.5] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      {...props}
    />
  );
}

function BottomSheetHandle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-handle"
      aria-hidden="true"
      className={cn(
        "relative z-raised flex h-5 w-full shrink-0 cursor-grab touch-none items-end justify-center active:cursor-grabbing after:block after:h-1 after:w-16 after:rounded-full after:bg-muted-foreground/40 lg:hidden",
        className,
      )}
      {...props}
    />
  );
}

function BottomSheetContent({
  className,
  children,
  ...props
}: BottomSheetPrimitive.Popup.Props) {
  const { hasSnapPoints, modal, showHandle } = useBottomSheet();

  return (
    <BottomSheetPortal>
      {modal === true ? (
        <BottomSheetOverlay data-snap-points={hasSnapPoints ? "" : undefined} />
      ) : null}
      <BottomSheetPrimitive.Viewport
        data-slot="bottom-sheet-viewport"
        data-modal={modal}
        className="pointer-events-none fixed inset-0 z-modal select-none data-[modal=true]:pointer-events-auto"
      >
        <BottomSheetPrimitive.Popup
          data-slot="bottom-sheet-popup"
          data-swipe-axis="y"
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={cn(
            "group/bottom-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-modal flex h-(--drawer-content-height) max-h-(--bottom-sheet-max-height) min-h-0 w-full origin-bottom transform-[translate3d(0,var(--bottom-sheet-translate-y,0px),0)] flex-col rounded-t-2xl border-t border-border bg-popover text-sm text-popover-foreground shadow-lg transition-[transform,height,opacity] duration-normal ease-decelerate will-change-transform outline-none select-none [interpolate-size:allow-keywords] [--bottom-sheet-closed-transform:translate3d(0,calc(100%+var(--spacing-px)),0)] [--bottom-sheet-max-height:calc(100dvh-var(--spacing-12))] [--bottom-sheet-stack-offset:0] [--bottom-sheet-translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)-var(--bottom-sheet-stack-offset))] [--drawer-content-height:var(--bottom-sheet-height,auto)] data-ending-style:transform-(--bottom-sheet-closed-transform) data-ending-style:opacity-[0.9999] data-nested-drawer-open:overflow-hidden data-nested-drawer-open:[--bottom-sheet-stack-offset:var(--spacing-3)] data-snap-points:[--drawer-content-height:100dvh] data-starting-style:transform-(--bottom-sheet-closed-transform) data-swiping:duration-0 lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:h-auto lg:max-h-[calc(100dvh-var(--spacing-24))] lg:w-96 lg:max-w-[calc(100vw-var(--spacing-12))] lg:origin-center lg:transform-[translate3d(-50%,calc(-50%+var(--bottom-sheet-translate-y,0px)),0)] lg:rounded-2xl lg:border lg:[--bottom-sheet-closed-transform:translate3d(-50%,-50%,0)] lg:[--bottom-sheet-max-height:calc(100dvh-var(--spacing-24))] lg:[--bottom-sheet-translate-y:var(--drawer-swipe-movement-y,0px)] lg:[--drawer-content-height:auto] lg:data-ending-style:opacity-0 lg:data-nested-drawer-open:[--bottom-sheet-stack-offset:0] lg:data-snap-points:[--drawer-content-height:auto] lg:data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {showHandle ? <BottomSheetHandle /> : null}
          <BottomSheetPrimitive.Content
            data-slot="bottom-sheet-content"
            className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain rounded-[inherit] select-text group-data-swiping/bottom-sheet:select-none"
          >
            {children}
          </BottomSheetPrimitive.Content>
        </BottomSheetPrimitive.Popup>
      </BottomSheetPrimitive.Viewport>
    </BottomSheetPortal>
  );
}

function BottomSheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-header"
      className={cn("flex shrink-0 flex-col gap-0.5 px-4 pt-3 pb-4", className)}
      {...props}
    />
  );
}

function BottomSheetBody({
  className,
  safeAreaBottom = false,
  ...props
}: React.ComponentProps<"div"> & {
  /** Adds bottom safe-area padding for sheets that do not render a footer. */
  safeAreaBottom?: boolean;
}) {
  return (
    <div
      data-slot="bottom-sheet-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4",
        safeAreaBottom
          ? "pb-[max(var(--spacing-4),env(safe-area-inset-bottom))]"
          : "pb-4",
        className,
      )}
      {...props}
    />
  );
}

function BottomSheetFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-col gap-2 border-t border-border bg-popover px-4 pt-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

function BottomSheetTitle({
  className,
  ...props
}: BottomSheetPrimitive.Title.Props) {
  return (
    <BottomSheetPrimitive.Title
      data-slot="bottom-sheet-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function BottomSheetDescription({
  className,
  ...props
}: BottomSheetPrimitive.Description.Props) {
  return (
    <BottomSheetPrimitive.Description
      data-slot="bottom-sheet-description"
      className={cn("text-sm text-balance text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHandle,
  BottomSheetHeader,
  BottomSheetOverlay,
  BottomSheetPortal,
  BottomSheetTitle,
  BottomSheetTrigger,
};
