import type { v1 } from "@repo/api-shared";
import { Badge } from "@repo/ui/components";

const statusClassNames = {
  DRAFT: "border-warning-subtle text-warning",
  POSTED: "border-success-subtle text-success",
  REVERSED: "border-border text-muted-foreground",
} as const satisfies Record<v1.finance.MoneyTransactionStatus, string>;

export function FinanceStatusBadge({
  status,
  label,
}: {
  status: v1.finance.MoneyTransactionStatus;
  label: string;
}) {
  return (
    <Badge variant="outline" className={statusClassNames[status]}>
      {label}
    </Badge>
  );
}
