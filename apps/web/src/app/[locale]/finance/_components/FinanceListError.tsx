"use client";

import { ListLayout, ListStatus } from "@repo/ui/components";
import { useTranslations } from "next-intl";

export default function FinanceListError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("shared");
  return (
    <ListLayout>
      <ListStatus
        error={t("errors.generic")}
        loadingLabel={t("status.loading")}
        retryLabel={t("actions.retry")}
        onRetry={unstable_retry}
      />
    </ListLayout>
  );
}
