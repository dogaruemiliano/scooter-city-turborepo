"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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

/** Checklist rows with optional inline item entry. */
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
    placeholder?: string;
    onAdd: (text: string) => Promise<boolean>;
  };
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  async function addItem() {
    if (
      !addAction ||
      disabled ||
      addAction.disabled ||
      submitting.current ||
      !text.trim()
    )
      return;
    submitting.current = true;
    setAdding(true);
    try {
      if (await addAction.onAdd(text.trim())) setText("");
    } finally {
      submitting.current = false;
      setAdding(false);
      input.current?.focus();
    }
  }
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
        <li className="flex min-h-12 items-center gap-3 p-4 focus-within:ring-2 focus-within:ring-inset focus-within:ring-border">
          <Plus
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Input
            ref={input}
            aria-label={addAction.label}
            placeholder={addAction.placeholder ?? addAction.label}
            className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:h-auto md:p-0"
            value={text}
            maxLength={300}
            enterKeyHint="next"
            readOnly={adding || disabled || addAction.disabled}
            aria-disabled={adding || disabled || addAction.disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              event.stopPropagation();
              void addItem();
            }}
          />
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
  headerAction,
  onClose,
  onSave,
}: {
  items: readonly ChecklistItem[];
  labels: ChecklistEditorLabels;
  busy?: boolean;
  error?: string | null;
  initialAdding?: boolean;
  headerAction?: ReactNode;
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
          <div className="flex items-center justify-between gap-3">
            <BottomSheetTitle>{labels.title}</BottomSheetTitle>
            {headerAction}
          </div>
        </BottomSheetHeader>
        <BottomSheetBody className="gap-4">
          <div
            data-base-ui-swipe-ignore=""
            className="overflow-hidden rounded-2xl border border-border bg-popover"
            data-slot="checklist-editor-list"
          >
            <SortableGrid
              items={items}
              axis="vertical"
              longPress
              className="flex flex-col"
              itemVariant="row"
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
                <div className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">
                    {item.text}
                  </span>
                  <GripVertical
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
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
            <div
              id={`${id}-add`}
              className="flex min-h-12 items-center gap-3 p-4 focus-within:ring-2 focus-within:ring-inset focus-within:ring-border"
            >
              <Label className="sr-only" htmlFor={`${id}-input`}>
                {labels.input}
              </Label>
              <Plus
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Input
                ref={input}
                id={`${id}-input`}
                className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:h-auto md:p-0"
                enterKeyHint="next"
                maxLength={300}
                value={text}
                placeholder={labels.add}
                disabled={interacting || items.length >= 50}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={keyDown}
              />
              <Button
                type="button"
                variant="ghost"
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
