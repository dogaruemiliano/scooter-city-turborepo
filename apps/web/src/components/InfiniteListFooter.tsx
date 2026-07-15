"use client";

import { useEffect, useRef } from "react";

import { Alert, AlertDescription, Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";

const PREFETCH_ROOT_MARGIN = "400px 0px";

interface InfiniteListFooterProps {
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadMore: () => Promise<void> | void;
}

export function InfiniteListFooter({
  hasMore,
  loading,
  error,
  onLoadMore,
}: InfiniteListFooterProps) {
  const t = useTranslations("shared");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loading || error || !("IntersectionObserver" in window)) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMore();
        }
      },
      { rootMargin: PREFETCH_ROOT_MARGIN },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [error, hasMore, loading, onLoadMore]);

  if (!hasMore && !error) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2" aria-live="polite">
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {error ? (
        <Alert variant="destructive" className="w-full max-w-md">
          <AlertDescription>{error}</AlertDescription>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onLoadMore()}
            >
              {t("actions.retry")}
            </Button>
          </div>
        </Alert>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t("status.loading")}</p>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void onLoadMore()}
        >
          {t("actions.loadMore")}
        </Button>
      )}
    </div>
  );
}
