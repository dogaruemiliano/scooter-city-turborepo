import { ListLayout, ListStatus } from "@repo/ui/components";
import { useTranslations } from "next-intl";

export default function FinanceListLoading() {
  const t = useTranslations("shared");
  return (
    <ListLayout aria-busy="true">
      <ListStatus
        loading
        initial
        loadingLabel={t("status.loading")}
        retryLabel={t("actions.retry")}
      />
    </ListLayout>
  );
}
