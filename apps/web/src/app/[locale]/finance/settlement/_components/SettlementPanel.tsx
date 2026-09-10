"use client";

/**
 * Company specific-benefit settlement for a period.
 *
 * The number this produces answers one narrow question: over these dates, the
 * company paid for things that benefited one associate in particular, so what
 * balancing payment squares that up between them?
 *
 * It is deliberately NOT combined with what the company owes an associate for
 * funding a cost out of their own pocket. Those are two different debts, and
 * showing them as one total is how a real obligation quietly disappears.
 */
import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  Label,
  Spinner,
} from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { resolveRouteLocale } from "@/i18n/paths";
import {
  financeUserLabel,
  formatBasisPoints,
  formatMinorAmount,
  formatSignedMinorAmount,
} from "@/lib/finance-format";
import { previewSettlement } from "../../expenses/_lib/expense-api";

export interface SettlementPanelProps {
  bookId: string;
  currency: string;
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
}

export function SettlementPanel({
  bookId,
  currency,
  defaultPeriodStart,
  defaultPeriodEnd,
}: SettlementPanelProps) {
  const t = useTranslations("finance.settlement");
  const tErrors = useTranslations("finance.errors");
  const locale = resolveRouteLocale(useLocale()) as SupportedLocale;
  const startId = useId();
  const endId = useId();

  const [periodStart, setPeriodStart] = useState(defaultPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [preview, setPreview] = useState<v1.finance.SettlementPreview>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculate() {
    setPending(true);
    setError(null);

    try {
      setPreview(
        await previewSettlement({
          bookId,
          kind: "COMPANY_SPECIFIC_BENEFIT",
          periodStart: new Date(`${periodStart}T00:00:00.000Z`).toISOString(),
          // The period is half-open, so the end date is exclusive: adding a
          // day makes the picker's "to" date read as inclusive to the user.
          periodEnd: new Date(`${periodEnd}T00:00:00.000Z`).toISOString(),
        }),
      );
    } catch (caught) {
      setPreview(undefined);
      setError(
        caught instanceof ApiError && caught.message
          ? caught.message
          : tErrors("generic"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={startId}>{t("periodStart")}</Label>
          <Input
            id={startId}
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={endId}>{t("periodEnd")}</Label>
          <Input
            id={endId}
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
          />
        </div>

        <Button
          type="button"
          disabled={pending}
          onClick={() => void calculate()}
        >
          {t("calculate")}
        </Button>
      </Card>

      {pending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {t("calculate")}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {preview && !pending ? (
        <>
          <Card className="flex flex-col gap-2 p-4">
            <p className="text-sm text-muted-foreground">{t("total")}</p>
            <p className="text-2xl font-medium tabular-nums">
              {formatMinorAmount(preview.totalAmountMinor, currency, locale)}
            </p>
          </Card>

          {preview.totalAmountMinor === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-2xl text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="p-3 font-normal">
                      {t("columns.associate")}
                    </th>
                    <th scope="col" className="p-3 text-right font-normal">
                      {t("columns.share")}
                    </th>
                    <th scope="col" className="p-3 text-right font-normal">
                      {t("columns.actual")}
                    </th>
                    <th scope="col" className="p-3 text-right font-normal">
                      {t("columns.expected")}
                    </th>
                    <th scope="col" className="p-3 text-right font-normal">
                      {t("columns.adjustment")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line) => (
                    <tr
                      key={line.associateId}
                      className="border-b last:border-b-0"
                    >
                      <td className="p-3">
                        {line.associate
                          ? financeUserLabel(line.associate)
                          : line.associateId}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatBasisPoints(line.shareBasisPoints, locale)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMinorAmount(
                          line.actualAmountMinor,
                          currency,
                          locale,
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMinorAmount(
                          line.expectedAmountMinor,
                          currency,
                          locale,
                        )}
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {formatSignedMinorAmount(
                          line.adjustmentMinor,
                          currency,
                          locale,
                        )}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {line.adjustmentMinor === 0
                            ? null
                            : line.adjustmentMinor > 0
                              ? t("mustReceive")
                              : t("mustPay")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-medium">{t("transfers.title")}</h2>

            {preview.transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("transfers.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {preview.transfers.map((transfer) => (
                  <li
                    key={`${transfer.fromAssociateId}-${transfer.toAssociateId}`}
                    className="flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span>
                      {t("transfers.line", {
                        from: transfer.fromAssociate
                          ? financeUserLabel(transfer.fromAssociate)
                          : transfer.fromAssociateId,
                        to: transfer.toAssociate
                          ? financeUserLabel(transfer.toAssociate)
                          : transfer.toAssociateId,
                      })}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMinorAmount(
                        transfer.amountMinor,
                        currency,
                        locale,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-sm text-muted-foreground">{t("separateNote")}</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
