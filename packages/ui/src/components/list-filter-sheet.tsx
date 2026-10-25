"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { FilterIcon } from "lucide-react";
import { SaveButton } from "./save-button";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@repo/ui/components/bottom-sheet";

export interface ListFilterSheetProps<T> {
  value: T;
  defaultValue: T;
  onApply: (value: T) => void | boolean | Promise<void | boolean>;
  appliedCount: number;
  title: string;
  description?: string;
  applyLabel: string;
  applyingLabel?: string;
  resetLabel: string;
  cancelLabel: string;
  applyErrorLabel?: string;
  disabled?: boolean;
  children: (draft: {
    value: T;
    setValue: Dispatch<SetStateAction<T>>;
  }) => ReactNode;
}

/** Fields are controlled drafts. Neither selecting, resetting nor dismissing applies filters. */
export function ListFilterSheet<T>({
  value,
  defaultValue,
  onApply,
  appliedCount,
  title,
  description,
  applyLabel,
  applyingLabel = applyLabel,
  resetLabel,
  cancelLabel,
  applyErrorLabel,
  disabled = false,
  children,
}: ListFilterSheetProps<T>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    if (next) {
      setDraft(value);
      setError(null);
    }
    setOpen(next);
  }

  async function apply() {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if ((await onApply(draft)) !== false) setOpen(false);
      else setError(applyErrorLabel ?? null);
    } catch (cause) {
      setError(
        applyErrorLabel ??
          (cause instanceof Error ? cause.message : String(cause)),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={changeOpen}>
      <BottomSheetTrigger
        render={<Button type="button" variant="outline" />}
        aria-label={title}
        disabled={disabled}
      >
        <FilterIcon aria-hidden="true" data-icon="inline-start" />
        {title}
        {appliedCount > 0 ? (
          <Badge variant="secondary">{appliedCount}</Badge>
        ) : null}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
          {description ? (
            <BottomSheetDescription>{description}</BottomSheetDescription>
          ) : null}
        </BottomSheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          aria-busy={busy || undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
        >
          <BottomSheetBody>
            <fieldset
              disabled={busy || disabled}
              className="flex min-w-0 flex-col gap-4"
            >
              {children({ value: draft, setValue: setDraft })}
            </fieldset>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </BottomSheetBody>
          <BottomSheetFooter>
            <SaveButton
              type="submit"
              disabled={disabled}
              state={busy ? "pending" : error ? "error" : "idle"}
              idleLabel={applyLabel}
              pendingLabel={applyingLabel}
              successLabel={applyLabel}
            />
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={busy || disabled}
                onClick={() => {
                  setDraft(defaultValue);
                  setError(null);
                }}
              >
                {resetLabel}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => changeOpen(false)}
              >
                {cancelLabel}
              </Button>
            </div>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
