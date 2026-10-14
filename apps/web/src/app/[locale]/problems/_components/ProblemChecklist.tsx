"use client";

import { useId, useState } from "react";
import { v1 } from "@repo/api-shared";
import { Button, Checkbox, Input, Label } from "@repo/ui/components";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function ProblemChecklist({
  problem,
  editable,
  busy,
  onSave,
}: {
  problem: v1.problems.Problem;
  editable: boolean;
  busy: boolean;
  onSave: (items: v1.problems.Problem["checklist"]) => void;
}) {
  const t = useTranslations("workspace.problems");
  const id = useId();
  const [items, setItems] = useState(problem.checklist ?? []);
  const [text, setText] = useState("");
  const dirty =
    JSON.stringify(items) !== JSON.stringify(problem.checklist ?? []);
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-heading`} className="text-base font-semibold">
          {t("checklist")}
        </h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t("checklistProgress", {
            completed: items.filter((item) => item.completed).length,
            total: items.length,
          })}
        </span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
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
              className={`min-w-0 flex-1 wrap-anywhere ${item.completed ? "line-through" : "text-popover-foreground"}`}
            >
              {item.text}
            </Label>
            {editable ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={t("removeChecklistItem", { text: item.text })}
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
            {t("emptyChecklist")}
          </li>
        ) : null}
      </ul>
      {editable ? (
        <>
          <form
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
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor={`${id}-new`}>{t("checklistItem")}</Label>
              <Input
                id={`${id}-new`}
                placeholder={t("checklistPlaceholder")}
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
              {t("addChecklistItem")}
            </Button>
          </form>
          <Button
            className="self-start"
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => onSave(items)}
          >
            {t("saveChecklist")}
          </Button>
        </>
      ) : null}
    </section>
  );
}
