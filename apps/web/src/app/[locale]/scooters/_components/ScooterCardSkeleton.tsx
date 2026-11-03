import { Card, CardContent, CardFooter, Skeleton } from "@repo/ui/components";
import { EllipsisIcon } from "lucide-react";

/** Mirrors ScooterCard's responsive layout without suggesting recorded data. */
export function ScooterCardSkeleton() {
  return (
    <Card className="relative isolate h-full gap-0 py-0" aria-hidden="true">
      <CardContent className="flex flex-1 flex-col gap-5 p-5 sm:gap-6 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="relative z-raised min-w-0 flex-1 py-1">
            <div className="flex flex-col items-start gap-2">
              <Skeleton className="h-5 w-32 max-w-full" />
              <Skeleton className="h-8 w-32 max-w-full sm:h-9" />
              <Skeleton className="h-4 w-24 max-w-full" />
            </div>
            <Skeleton className="mt-3 h-4 w-36 max-w-full" />
            <Skeleton className="mt-1 h-lh w-12 max-w-full text-xs" />
          </div>
          <div className="relative flex h-36 w-32 shrink-0 items-center justify-center overflow-visible sm:h-48 sm:w-48">
            <Skeleton
              className="absolute -inset-y-5 -right-5 w-64 rounded-none sm:-inset-y-6 sm:-right-6 sm:w-72"
              style={{
                maskImage: "url('/scooter-placeholder.png')",
                maskSize: "contain",
                maskPosition: "right",
                maskRepeat: "no-repeat",
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <Skeleton className="h-lh w-12" />
          <Skeleton className="h-lh w-16" />
          <Skeleton className="h-lh w-20" />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:gap-6 sm:pt-6">
          {["rental", "health"].map((key) => (
            <div key={key} className="min-w-0">
              <Skeleton className="mb-2 h-lh w-20 max-w-full text-xs" />
              <div className="flex items-center gap-2 text-sm leading-snug">
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <Skeleton className="h-lh w-24 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-x-4 gap-y-3 bg-muted px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <Skeleton className="h-lh w-12 bg-border text-xs" />
          <Skeleton className="mt-1 h-lh w-24 bg-border text-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-4 rounded-full bg-border" />
          <Skeleton className="h-3 w-16 bg-border" />
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center">
          <EllipsisIcon className="size-4 text-muted-foreground" />
        </div>
      </CardFooter>
    </Card>
  );
}
