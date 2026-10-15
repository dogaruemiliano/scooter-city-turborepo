"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { buttonVariants } from "@repo/ui/components/button";
import { ProblemPhotos } from "./ProblemPhotos";
import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Badge,
  Button,
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
} from "@repo/ui/components";

export function ProblemDetailSheet({
  problem,
  onClose,
}: {
  problem: v1.problems.Problem | null;
  onClose: () => void;
}) {
  const t = useTranslations("workspace");
  const shared = useTranslations("shared");
  const locale = resolveRouteLocale(useLocale());
  return (
    <BottomSheet
      open={problem !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheetContent className="lg:w-(--container-form-columns)">
        {problem ? (
          <>
            <BottomSheetHeader className="gap-2 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <BottomSheetTitle className="text-xl">
                  {problem.title}
                </BottomSheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={shared("actions.close")}
                  onClick={onClose}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <BottomSheetDescription>
                <span className="font-semibold text-popover-foreground">
                  {v1.scooters.scooterDisplayCode(problem.scooter)}
                </span>
                {` · ${problem.scooter.brandName} ${problem.scooter.model ?? ""}`}
              </BottomSheetDescription>
            </BottomSheetHeader>
            <BottomSheetBody safeAreaBottom className="gap-6 pt-4">
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t("status")}
                  </dt>
                  <dd>
                    <Badge
                      variant={
                        problem.status === "resolved" ? "success" : "secondary"
                      }
                    >
                      {t(`problems.${problem.status}`)}
                    </Badge>
                  </dd>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <dt className="text-sm font-medium text-muted-foreground">
                    {t("problems.severity")}
                  </dt>
                  <dd className="font-semibold">
                    {t(`problems.${problem.severity}`)}
                  </dd>
                </div>
              </dl>
              {problem.blocksUsage &&
              !problem.holdClearedAt &&
              problem.status !== "resolved" ? (
                <Badge variant="destructive" className="self-start">
                  {t("problems.blocksUsage")}
                </Badge>
              ) : null}
              <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <h3 className="text-base font-semibold">
                  {t("problems.detailDescription")}
                </h3>
                <p className="whitespace-pre-wrap text-sm wrap-anywhere">
                  {problem.description || t("problems.noDescription")}
                </p>
              </section>
              {problem.photos.length ? (
                <ProblemPhotos
                  key={problem.id}
                  problem={problem}
                  editable={false}
                  disabled={false}
                  onBusyChange={() => {}}
                  onSave={async () => {}}
                />
              ) : null}
              <Link
                className={buttonVariants()}
                href={localizePath(
                  `/problems/${encodeURIComponent(problem.id)}`,
                  locale,
                )}
              >
                {t("problems.openProblem")}
              </Link>
            </BottomSheetBody>
          </>
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}
