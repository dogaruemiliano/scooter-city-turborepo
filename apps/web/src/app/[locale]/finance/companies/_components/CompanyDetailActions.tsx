"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import { webApi } from "@/lib/api";

export function CompanyDetailActions({
  companyId,
  companiesHref,
  editHref,
}: {
  companyId: string;
  companiesHref: string;
  editHref: string;
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function deleteCompany() {
    setBusy(true);
    setError(undefined);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.companies.delete(companyId),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      setDeleteOpen(false);
      router.replace(companiesHref);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("feedback.genericError"),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <MoreActionsMenu
        ariaLabel={t("companies.detail.moreActions")}
        groups={[
          [
            {
              key: "edit",
              label: t("companies.form.editTitle"),
              icon: <PencilIcon data-icon="inline-start" />,
              disabled: busy,
              onClick: () => router.push(editHref),
            },
          ],
          [
            {
              key: "delete",
              label: t("companies.detail.delete"),
              icon: <Trash2Icon data-icon="inline-start" />,
              variant: "destructive",
              disabled: busy,
              onClick: () => setDeleteOpen(true),
            },
          ],
        ]}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => !busy && setDeleteOpen(nextOpen)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("companies.detail.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("companies.detail.deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void deleteCompany()}
            >
              {busy
                ? t("companies.detail.deleting")
                : t("companies.detail.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
