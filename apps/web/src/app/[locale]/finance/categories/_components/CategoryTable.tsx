"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { webApi } from "@/lib/api";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { EditCategoryDialog } from "./EditCategoryDialog";

export function CategoryTable({
  categories,
}: {
  categories: v1.finance.FinancialCategory[];
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string>();
  const [feedback, setFeedback] = useState<
    { kind: "success" | "error"; message: string } | undefined
  >();
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  async function setCategoryActive(
    category: v1.finance.FinancialCategory,
    isActive: boolean,
  ) {
    const input = v1.finance.updateFinancialCategoryInputSchema.parse({
      isActive,
    });
    setBusyId(category.id);
    setFeedback(undefined);

    try {
      await webApi.fetch(
        v1.finance.ROUTES.categories.update(category.id),
        v1.finance.financialCategorySchema,
        {
          method: "PATCH",
          json: input,
        },
      );
      setFeedback({
        kind: "success",
        message: t("categories.update.success"),
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
      setBusyId(undefined);
    }
  }

  if (categories.length === 0) {
    return <FinanceEmptyState>{t("categories.list.empty")}</FinanceEmptyState>;
  }

  return (
    <section className="space-y-4">
      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("categories.columns.code")}</TableHead>
              <TableHead>{t("categories.columns.name")}</TableHead>
              <TableHead>{t("categories.columns.kind")}</TableHead>
              <TableHead>{t("categories.columns.parent")}</TableHead>
              <TableHead>{t("categories.columns.status")}</TableHead>
              <TableHead className="text-right">
                {t("categories.columns.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const parent = category.parentCategoryId
                ? categoryById.get(category.parentCategoryId)
                : undefined;
              const busy = busyId === category.id;

              return (
                <TableRow key={category.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {category.code}
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t(`enums.categoryKinds.${category.kind}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {parent?.name ?? t("categories.create.noParent")}
                  </TableCell>
                  <TableCell>
                    {category.isActive
                      ? t("common.active")
                      : t("common.inactive")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <EditCategoryDialog
                        category={category}
                        categories={categories}
                      />
                      <span className="sr-only">
                        {`${t("categories.columns.status")}: ${category.name}`}
                      </span>
                      <Switch
                        checked={category.isActive}
                        disabled={busy}
                        aria-label={`${t("categories.columns.status")}: ${category.name}`}
                        onCheckedChange={(checked) =>
                          void setCategoryActive(category, checked)
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
