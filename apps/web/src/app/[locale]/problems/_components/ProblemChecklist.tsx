"use client";

import { useId, useState } from "react";
import { v1 } from "@repo/api-shared";
import { Button, Checkbox, Input, Label } from "@repo/ui/components";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function ProblemChecklist({
  problem,
  kind = "checklist",
  editable,
  busy,
  onSave,
}: {
  problem: v1.problems.Problem;
  kind?: "checklist" | "buyList";
  editable: boolean;
  busy: boolean;
  onSave: (items: v1.problems.Problem["checklist"]) => void;
}) {
  const t = useTranslations("workspace.problems");
  const id = useId();
  const [items, setItems] = useState(problem[kind] ?? []);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(problem[kind] ?? []);
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`${id}-heading`}
          className="text-sm font-semibold text-muted-foreground"
        >
          {t(kind === "buyList" ? "buyList" : "checklist")}
        </h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t(kind === "buyList" ? "buyListProgress" : "checklistProgress", {
            completed: items.filter((item) => item.completed).length,
            total: items.length,
          })}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex min-h-12 items-center gap-3 p-4">
              <Checkbox
                id={`${id}-${item.id}`}
                checked={item.completed}
                disabled={!editable || busy}
                onCheckedChange={(completed) =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.id === item.id ? { ...entry, completed } : entry,
                    ),
                  )
                }
              />
              <Label
                htmlFor={`${id}-${item.id}`}
                className={`min-w-0 flex-1 wrap-anywhere ${item.completed ? "line-through" : "text-card-foreground"}`}
              >
                {item.text}
              </Label>
              {editable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={t(
                    kind === "buyList"
                      ? "removeBuyListItem"
                      : "removeChecklistItem",
                    { text: item.text },
                  )}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
          {!items.length ? (
            <li className="p-4 text-sm text-muted-foreground">
              {t(kind === "buyList" ? "emptyBuyList" : "emptyChecklist")}
            </li>
          ) : null}
        </ul>
        {editable ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-none border-t border-border"
            disabled={busy || items.length >= 50}
            onClick={() => setAdding((value) => !value)}
            aria-expanded={adding}
            aria-controls={`${id}-add`}
          >
            <Plus aria-hidden="true" />
            {t(kind === "buyList" ? "addBuyListItem" : "addChecklistItem")}
          </Button>
        ) : null}
      </div>
      {editable ? (
        <>
          {adding ? (
            <form
              id={`${id}-add`}
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!text.trim() || busy || items.length >= 50) return;
                setItems((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    text: text.trim(),
                    completed: false,
                  },
                ]);
                setText("");
                setAdding(false);
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor={`${id}-new`}>
                  {t(kind === "buyList" ? "buyListItem" : "checklistItem")}
                </Label>
                <Input
                  id={`${id}-new`}
                  placeholder={t(
                    kind === "buyList"
                      ? "buyListPlaceholder"
                      : "checklistPlaceholder",
                  )}
                  maxLength={300}
                  value={text}
                  disabled={busy || items.length >= 50}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !text.trim() || items.length >= 50}
              >
                {t(kind === "buyList" ? "addBuyListItem" : "addChecklistItem")}
              </Button>
            </form>
          ) : null}
          {dirty ? (
            <Button
              className="self-start"
              variant="outline"
              disabled={busy || !dirty}
              onClick={() => onSave(items)}
            >
              {t(kind === "buyList" ? "saveBuyList" : "saveChecklist")}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
