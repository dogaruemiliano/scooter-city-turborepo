"use client";

import { useId, useState } from "react";
import { v1 } from "@repo/api-shared";
import { Button, ChecklistEditor, ChecklistList } from "@repo/ui/components";
import { ClipboardList, Pencil, ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";

export function ProblemChecklist({
  problem,
  kind = "checklist",
  editable,
  busy,
  error,
  onSave,
  initialOpen = false,
  onEditorClose,
}: {
  problem: Pick<v1.problems.Problem, "checklist" | "buyList">;
  kind?: "checklist" | "buyList";
  initialOpen?: boolean;
  onEditorClose?: () => void;
  editable: boolean;
  busy: boolean;
  error?: string | null;
  onSave: (items: v1.problems.Problem["checklist"]) => Promise<boolean>;
}) {
  const t = useTranslations("workspace.problems");
  const shared = useTranslations("workspace");
  const id = useId();
  const [editor, setEditor] = useState<"add" | "edit" | null>(
    initialOpen ? "add" : null,
  );
  const items = problem[kind];
  const title = t(kind);
  const Icon = kind === "buyList" ? ShoppingCart : ClipboardList;
  const edit = t(kind === "buyList" ? "editBuyList" : "editChecklist");
  const add = t(kind === "buyList" ? "addBuyListItem" : "addChecklistItem");
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`${id}-heading`}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          {title}
          <Icon aria-hidden="true" className="size-4 shrink-0" />
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {t(kind === "buyList" ? "buyListProgress" : "checklistProgress", {
              completed: items.filter((item) => item.completed).length,
              total: items.length,
            })}
          </span>
          {editable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={edit}
              disabled={busy}
              onClick={() => setEditor("edit")}
            >
              <Pencil aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      <ChecklistList
        items={items}
        emptyMessage={t(kind === "buyList" ? "emptyBuyList" : "emptyChecklist")}
        disabled={!editable || busy}
        addAction={
          editable
            ? {
                label: add,
                disabled: busy || items.length >= 50,
                onClick: () => setEditor("add"),
              }
            : undefined
        }
        onCheckedChange={(id, completed) => {
          void onSave(
            items.map((item) =>
              item.id === id ? { ...item, completed } : item,
            ),
          );
        }}
      />
      {editor ? (
        <ChecklistEditor
          items={items}
          initialAdding={editor === "add"}
          busy={busy}
          error={error}
          onClose={() => {
            setEditor(null);
            onEditorClose?.();
          }}
          onSave={onSave}
          labels={{
            title: initialOpen
              ? t(kind === "buyList" ? "createBuyList" : "createChecklist")
              : edit,
            description: t("checklistEditorDescription"),
            instructions: t("checklistSortInstructions"),
            empty: t(kind === "buyList" ? "emptyBuyList" : "emptyChecklist"),
            add,
            input: t(kind === "buyList" ? "buyListItem" : "checklistItem"),
            placeholder: t(
              kind === "buyList"
                ? "buyListPlaceholder"
                : "checklistPlaceholder",
            ),
            save: t(kind === "buyList" ? "saveBuyList" : "saveChecklist"),
            cancel: shared("cancel"),
            remove: (text) =>
              t(
                kind === "buyList"
                  ? "removeBuyListItem"
                  : "removeChecklistItem",
                { text },
              ),
            reorder: (text) => t("reorderChecklistItem", { text }),
          }}
        />
      ) : null}
    </section>
  );
}
