import { Skeleton } from "@repo/ui/components";

export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
