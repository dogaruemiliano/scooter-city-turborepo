"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "./alert";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "./bottom-sheet";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";
import { SortableGrid } from "./sortable-grid";

export type ChecklistItem = { id: string; text: string; completed: boolean };

/** Read/check surface; structural changes belong to ChecklistEditor. */
export function ChecklistList({
  items,
  emptyMessage,
  disabled,
  onCheckedChange,
  addAction,
}: {
  items: readonly ChecklistItem[];
  emptyMessage: string;
  disabled?: boolean;
  onCheckedChange: (id: string, completed: boolean) => void;
  addAction?: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
  };
}) {
  const id = useId();
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
      {items.map((item) => (
        <li key={item.id} className="flex min-h-12 items-center gap-3 p-4">
          <Label
            htmlFor={`${id}-${item.id}`}
            className={`min-w-0 flex-1 wrap-anywhere ${item.completed ? "line-through" : "text-card-foreground"}`}
          >
            {item.text}
          </Label>
          <Checkbox
            id={`${id}-${item.id}`}
            className="rounded-full"
            checked={item.completed}
            disabled={disabled}
            onCheckedChange={(completed) => onCheckedChange(item.id, completed)}
          />
        </li>
      ))}
      {!items.length && !addAction ? (
        <li className="p-4 text-sm text-muted-foreground">{emptyMessage}</li>
      ) : null}
      {addAction ? (
        <li>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 w-full justify-start gap-3 rounded-none p-4 text-muted-foreground"
            disabled={disabled || addAction.disabled}
            onClick={addAction.onClick}
          >
            <Plus aria-hidden="true" />
            {addAction.label}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

export type ChecklistEditorLabels = {
  title: string;
  description: string;
  instructions: string;
  empty: string;
  add: string;
  input: string;
  placeholder: string;
  save: string;
  cancel: string;
  remove: (text: string) => string;
  reorder: (text: string) => string;
};

/** Mount when opened to start an isolated draft. Save commits it; dismissal discards it. */
export function ChecklistEditor({
  items: initialItems,
  labels,
  busy = false,
  error,
  initialAdding = false,
  onClose,
  onSave,
}: {
  items: readonly ChecklistItem[];
  labels: ChecklistEditorLabels;
  busy?: boolean;
  error?: string | null;
  initialAdding?: boolean;
  onClose: () => void;
  onSave: (items: ChecklistItem[]) => Promise<boolean>;
}) {
  const id = useId();
  const [items, setItems] = useState([...initialItems]);
  const [text, setText] = useState("");
  const [sorting, setSorting] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const blocked = busy || saving;
  const interacting = blocked || sorting;
  function addItem() {
    if (interacting || !text.trim() || items.length >= 50) return;
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), text: text.trim(), completed: false },
    ]);
    setText("");
    input.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    addItem();
  }
  return (
    <BottomSheet
      open
      dismissible={!interacting}
      onOpenChange={(open) => {
        if (!open && !interacting) onClose();
      }}
    >
      <BottomSheetContent
        className="lg:w-(--container-form-columns)"
        initialFocus={initialAdding ? input : undefined}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>{labels.title}</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody className="gap-4">
          <div data-base-ui-swipe-ignore="">
            <SortableGrid
              items={items}
              axis="vertical"
              longPress
              className="flex flex-col gap-2"
              getItemLabel={(item) => labels.reorder(item.text)}
              instructions={labels.instructions}
              disabled={blocked}
              onInteractionChange={setSorting}
              onOrderChange={async (ids) => {
                const byId = new Map(items.map((item) => [item.id, item]));
                setItems(
                  ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
                );
                return true;
              }}
              renderItem={(item) => (
                <div className="flex min-h-12 items-center gap-3 p-3">
                  <GripVertical
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">
                    {item.text}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={interacting}
                    aria-label={labels.remove(item.text)}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((entry) => entry.id !== item.id),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            />
          </div>
          <div id={`${id}-add`} className="flex flex-col gap-2">
            <Label className="sr-only" htmlFor={`${id}-input`}>
              {labels.input}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                ref={input}
                id={`${id}-input`}
                className="min-w-0 flex-1"
                enterKeyHint="next"
                maxLength={300}
                value={text}
                placeholder={labels.placeholder}
                disabled={interacting || items.length >= 50}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={keyDown}
              />
              <Button
                type="button"
                variant="outline"
                className="hidden shrink-0 lg:inline-flex"
                disabled={interacting || !text.trim() || items.length >= 50}
                onClick={addItem}
              >
                {labels.add}
              </Button>
            </div>
          </div>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </BottomSheetBody>
        <BottomSheetFooter>
          <Button
            type="button"
            disabled={interacting}
            onClick={async () => {
              if (interacting) return;
              const next =
                text.trim() && items.length < 50
                  ? [
                      ...items,
                      {
                        id: crypto.randomUUID(),
                        text: text.trim(),
                        completed: false,
                      },
                    ]
                  : items;
              setSaving(true);
              try {
                if (await onSave(next)) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {labels.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={interacting}
            onClick={onClose}
          >
            {labels.cancel}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
