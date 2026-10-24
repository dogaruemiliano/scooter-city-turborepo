"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export type WizardExitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actions: ReactNode;
  children?: ReactNode;
};

/** Shared exit surface; callers own persistence, recovery, and localized actions. */
export function WizardExitDialog({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
}: WizardExitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
