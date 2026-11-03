"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components";
import { SaveButton } from "@repo/ui/components/save-button";
import { PageHeaderNavigation } from "./PageHeaderNavigation";
import { useWizardLeaveGuard } from "./useWizardLeaveGuard";

/** Page forms share exit protection; draft-backed flows retain their own recovery UI. */
export function useFormExitProtection({
  dirty,
  pending = false,
  enabled = true,
  onLeave,
}: {
  dirty: boolean;
  pending?: boolean;
  enabled?: boolean;
  onLeave?: () => void;
}) {
  const t = useTranslations("shared.formExit");
  const guard = useWizardLeaveGuard(enabled && dirty, {
    blocked: enabled && pending,
  });
  function requestLeave() {
    guard.requestLeave(onLeave ?? guard.back);
  }
  return {
    complete: guard.complete,
    requestLeave,
    protection: enabled ? (
      <>
        <PageHeaderNavigation onBack={requestLeave} backDisabled={pending} />
        <Dialog
          open={guard.open}
          onOpenChange={(open) => {
            if (!open) guard.cancel();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={guard.cancel}>
                {t("keepEditing")}
              </Button>
              <SaveButton
                type="button"
                variant="destructive"
                disabled={pending}
                idleLabel={t("discard")}
                pendingLabel={t("discard")}
                successLabel={t("discard")}
                onClick={() => guard.leave()}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    ) : null,
  };
}
