import type { ReactNode } from "react";

import { cn } from "@repo/ui/lib/utils";

export function DetailField({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}
