"use client";

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { XIcon } from "lucide-react";
import type { ReactElement, ReactNode, RefObject } from "react";

export function ScooterImportDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  closeLabel,
  initialFocus,
  finalFocus,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactElement<{ children?: ReactNode }>;
  title: string;
  description: string;
  closeLabel: string;
  initialFocus: RefObject<HTMLButtonElement | null>;
  finalFocus?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  footer: ReactNode;
}) {
  const mobile = useIsMobile();
  const Root = mobile ? BottomSheet : Dialog;
  const Trigger = mobile ? BottomSheetTrigger : DialogTrigger;
  const Title = mobile ? BottomSheetTitle : DialogTitle;
  const Description = mobile ? BottomSheetDescription : DialogDescription;
  const header = (
    <>
      <Title>{title}</Title>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={closeLabel}
          onClick={() => onOpenChange(false)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </>
  );
  const body = (
    <>
      <Description className="sr-only">{description}</Description>
      {children}
    </>
  );
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Trigger render={trigger} /> : null}
      {mobile ? (
        <BottomSheetContent initialFocus={initialFocus} finalFocus={finalFocus}>
          <BottomSheetHeader className="flex-row items-center justify-between gap-3">
            {header}
          </BottomSheetHeader>
          <BottomSheetBody safeAreaBottom={!footer}>{body}</BottomSheetBody>
          {footer ? <BottomSheetFooter>{footer}</BottomSheetFooter> : null}
        </BottomSheetContent>
      ) : (
        <DialogContent
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-var(--spacing-12))] flex-col sm:max-w-lg"
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            {header}
          </div>
          <div className="grid min-h-0 gap-3 overflow-y-auto">{body}</div>
          {footer ? (
            <div className="flex shrink-0 justify-end gap-2">{footer}</div>
          ) : null}
        </DialogContent>
      )}
    </Root>
  );
}
