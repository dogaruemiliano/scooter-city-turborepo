"use client";

import { v1 } from "@repo/api-shared";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components";
import {
  CornerDownRightIcon,
  GitForkIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import { categoryIconComponent } from "../../_lib/category-icons";
import { EditCategoryDialog } from "./EditCategoryDialog";

const categoryKindClassNames = {
  INCOME: "border-success-subtle bg-success-subtle text-success",
  EXPENSE: "border-destructive-subtle bg-destructive-subtle text-destructive",
} as const satisfies Record<v1.finance.FinancialCategoryKind, string>;

function CategoryKindBadge({
  kind,
  label,
}: {
  kind: v1.finance.FinancialCategoryKind;
  label: string;
}) {
  return (
    <Badge variant="outline" className={categoryKindClassNames[kind]}>
      {label}
    </Badge>
  );
}

function CategoryCardContent({
  category,
  Icon,
  parentName,
  rootLabel,
  kindLabel,
}: {
  category: v1.finance.FinancialCategory;
  Icon?: LucideIcon;
  parentName?: string;
  rootLabel: string;
  kindLabel: string;
}) {
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex min-h-4 max-w-full items-center gap-1 text-xs text-muted-foreground">
          {parentName ? (
            <>
              <CornerDownRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0"
                data-icon="hierarchy-connector"
              />
              <span className="truncate">{parentName}</span>
            </>
          ) : (
            <>
              <GitForkIcon
                aria-hidden="true"
                className="size-3.5"
                data-icon="hierarchy-root"
              />
              <span className="sr-only">{rootLabel}</span>
            </>
          )}
        </span>
        <span className="max-w-full truncate font-medium text-foreground">
          {category.name}
        </span>
      </span>
      <CategoryKindBadge kind={category.kind} label={kindLabel} />
    </span>
  );
}

export function CategoryTable({
  categories,
}: {
  categories: v1.finance.FinancialCategory[];
}) {
  const t = useTranslations("finance");
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  if (categories.length === 0) {
    return <FinanceEmptyState>{t("categories.list.empty")}</FinanceEmptyState>;
  }

  return (
    <section>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("categories.columns.name")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const parent = category.parentCategoryId
                ? categoryById.get(category.parentCategoryId)
                : undefined;
              const Icon = categoryIconComponent(category.icon);

              return (
                <TableRow key={category.id}>
                  <TableCell className="p-0">
                    <EditCategoryDialog
                      category={category}
                      categories={categories}
                      trigger={
                        <button
                          type="button"
                          className="flex min-h-16 w-full items-center px-2 py-2 text-left outline-none transition-colors duration-fast ease-standard focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <CategoryCardContent
                            category={category}
                            Icon={Icon}
                            parentName={parent?.name}
                            rootLabel={t("categories.list.parentCategory")}
                            kindLabel={t(
                              `enums.categoryKinds.${category.kind}`,
                            )}
                          />
                        </button>
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {categories.map((category) => {
          const parent = category.parentCategoryId
            ? categoryById.get(category.parentCategoryId)
            : undefined;
          const Icon = categoryIconComponent(category.icon);

          return (
            <li
              key={category.id}
              className="overflow-hidden rounded-xl border border-border bg-card transition-colors duration-fast ease-standard hover:bg-muted"
            >
              <EditCategoryDialog
                category={category}
                categories={categories}
                trigger={
                  <button
                    type="button"
                    className="flex min-h-16 w-full items-center p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <CategoryCardContent
                      category={category}
                      Icon={Icon}
                      parentName={parent?.name}
                      rootLabel={t("categories.list.parentCategory")}
                      kindLabel={t(`enums.categoryKinds.${category.kind}`)}
                    />
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
