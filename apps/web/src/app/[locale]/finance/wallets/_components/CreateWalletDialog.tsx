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
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";

type CompanyWalletType = v1.finance.CompanyWalletType;

export function CreateWalletDialog() {
  const t = useTranslations("finance");
  const router = useRouter();
  const nameId = useId();
  const typeId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CompanyWalletType>("COMPANY_CASH");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) setFeedback(undefined);
  }

  async function createWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const input = v1.finance.createCompanyWalletInputSchema.safeParse({
      name,
      type,
    });

    if (!input.success) {
      setFeedback({
        kind: "error",
        message: t("wallets.create.error"),
      });
      return;
    }

    setBusy(true);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.wallets.create,
        v1.finance.walletSchema,
        {
          method: "POST",
          json: input.data,
        },
      );
      setName("");
      setType("COMPANY_CASH");
      setFeedback({
        kind: "success",
        message: t("wallets.create.success"),
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : t("feedback.genericError"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" />}>
        <PlusIcon data-icon="inline-start" />
        {t("wallets.createButton")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={createWallet} className="contents">
          <DialogHeader>
            <DialogTitle>{t("wallets.create.title")}</DialogTitle>
            <DialogDescription>
              {t("wallets.create.description")}
            </DialogDescription>
          </DialogHeader>

          {feedback ? (
            <Alert
              variant={feedback.kind === "error" ? "destructive" : "default"}
            >
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={nameId}>{t("wallets.create.name")}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label id={typeId}>{t("wallets.create.type")}</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as CompanyWalletType)}
                disabled={busy}
              >
                <SelectTrigger aria-labelledby={typeId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {v1.finance.COMPANY_WALLET_TYPES.map((walletType) => (
                    <SelectItem key={walletType} value={walletType}>
                      {t(`enums.walletTypes.${walletType}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy
                ? t("wallets.create.submitting")
                : t("wallets.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
