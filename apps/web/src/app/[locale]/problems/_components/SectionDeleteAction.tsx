"use client";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
  Button,
} from "@repo/ui/components";
import { Feedback, useTask } from "@/components/WorkspaceForm";

export function SectionDeleteAction({
  kind,
  busy,
  onDelete,
}: {
  kind: "checklist" | "buyList" | "location";
  busy: boolean;
  onDelete: () => Promise<boolean | void>;
}) {
  const formAction = useFormAction();

  const t = useTranslations("workspace.problems");
  const shared = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const task = useTask();
  const title = t(
    kind === "checklist"
      ? "deleteChecklist"
      : kind === "buyList"
        ? "deleteBuyList"
        : "deleteLocation",
  );
  const blocked = busy || task.busy;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={title}
        disabled={blocked}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <BottomSheet
        open={open}
        dismissible={!blocked}
        onOpenChange={(next) => {
          if (!blocked) setOpen(next);
        }}
      >
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>{title}</BottomSheetTitle>
            <BottomSheetDescription>
              {t(
                kind === "location"
                  ? "deleteLocationDescription"
                  : "deleteListDescription",
              )}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
            <Feedback error={task.error} />
          </BottomSheetBody>
          <BottomSheetFooter>
            <SaveButton
              type="button"
              variant="destructive"
              disabled={blocked}
              onClick={() => {
                void task.run(async () => {
                  if ((await onDelete()) === false)
                    throw new Error(t("deleteSectionFailed"));
                  setOpen(false);
                });
              }}
              {...formAction(
                "delete",
                { pending: task.busy, error: task.error },
                title,
              )}
            />
            <Button
              type="button"
              variant="ghost"
              disabled={blocked}
              onClick={() => setOpen(false)}
            >
              {shared("cancel")}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
