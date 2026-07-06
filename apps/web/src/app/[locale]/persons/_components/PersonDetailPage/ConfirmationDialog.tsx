"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";

export function ConfirmationDialog({
  open,
  onOpenChange,
  triggerLabel,
  triggerIcon,
  triggerAriaLabel,
  triggerButtonClassName,
  triggerLabelClassName,
  triggerSize = "sm",
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  triggerAriaLabel?: string;
  triggerButtonClassName?: string;
  triggerLabelClassName?: string;
  triggerSize?: "sm" | "icon-sm";
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const t = useTranslations("persons");
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setActualOpen(nextOpen);
  }

  async function confirm() {
    if (await onConfirm()) {
      setActualOpen(false);
    }
  }

  return (
    <Dialog open={actualOpen} onOpenChange={changeOpen}>
      {triggerLabel ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size={triggerSize}
              aria-label={triggerAriaLabel}
              className={triggerButtonClassName}
            />
          }
        >
          {triggerIcon}
          <span className={triggerLabelClassName}>{triggerLabel}</span>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={busy} />}
          >
            {t("actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t("actions.deleting") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
