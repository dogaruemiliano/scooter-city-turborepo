"use client";

import { useEffect, useRef } from "react";

import { ListLoadMore } from "@repo/ui/components/list";
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

  return (
    <ListLoadMore
      hasMore={hasMore}
      loading={loading}
      error={error}
      onLoadMore={() => void onLoadMore()}
      loadingLabel={t("status.loading")}
      loadMoreLabel={t("actions.loadMore")}
      retryLabel={t("actions.retry")}
    >
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </ListLoadMore>
  );
}
