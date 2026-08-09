"use client";

import {
  Badge,
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
} from "@repo/ui/components";
import { CheckIcon, FilterIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

interface ListFilterSheetProps {
  appliedCount: number;
  applyLabel: string;
  children: ReactNode;
  description: string;
  disabled?: boolean;
  formId: string;
  onApply: (formData: FormData) => Promise<void> | void;
  onReset: () => Promise<void> | void;
  resetLabel: string;
  title: string;
}

export function ListFilterSheet({
  appliedCount,
  applyLabel,
  children,
  description,
  disabled = false,
  formId,
  onApply,
  onReset,
  resetLabel,
  title,
}: ListFilterSheetProps) {
  const [open, setOpen] = useState(false);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onApply(new FormData(event.currentTarget));
    setOpen(false);
  }

  async function resetFilters() {
    await onReset();
    setOpen(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
        aria-label={title}
      >
        <FilterIcon data-icon="inline-start" />
        {title}
        {appliedCount > 0 ? (
          <Badge variant="secondary" aria-hidden="true">
            {appliedCount}
          </Badge>
        ) : null}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
          <BottomSheetDescription>{description}</BottomSheetDescription>
        </BottomSheetHeader>
        <form
          id={formId}
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => void applyFilters(event)}
        >
          <BottomSheetBody>{children}</BottomSheetBody>
          <BottomSheetFooter>
            <Button type="submit" disabled={disabled}>
              <CheckIcon data-icon="inline-start" />
              {applyLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => void resetFilters()}
            >
              {resetLabel}
            </Button>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
