import type { ComponentProps, Key, ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

export interface ListLayoutProps extends ComponentProps<"section"> {
  filters?: ReactNode;
  action?: ReactNode;
  search?: ReactNode;
  summary?: ReactNode;
  footer?: ReactNode;
}

/** Shared collection structure. Routing, queries, permissions and items belong to callers. */
export function ListLayout({
  filters,
  action,
  search,
  summary,
  footer,
  children,
  className,
  ...props
}: ListLayoutProps) {
  return (
    <section
      data-slot="list-layout"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    >
      {filters || action ? (
        <div
          data-slot="list-header"
          className="flex min-w-0 items-center justify-between gap-3"
        >
          {filters ? <div className="min-w-0 shrink-0">{filters}</div> : null}
          {action ? (
            <div
              data-slot="list-action"
              className="ml-auto flex min-w-0 justify-end [&_button]:whitespace-normal [&_a]:whitespace-normal"
            >
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      {search ? (
        <div data-slot="list-search" className="min-w-0">
          {search}
        </div>
      ) : null}
      {summary ? (
        <div data-slot="list-summary" className="text-sm text-muted-foreground">
          {summary}
        </div>
      ) : null}
      <div data-slot="list-content" className="flex min-w-0 flex-col gap-4">
        {children}
      </div>
      {footer ? <div data-slot="list-footer">{footer}</div> : null}
    </section>
  );
}

export interface ListItemsProps<T> extends Omit<
  ComponentProps<"ul">,
  "children" | "ref"
> {
  items: readonly T[];
  getItemKey: (item: T) => Key;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
  itemClassName?: string;
  ordered?: boolean;
}

export function ListItems<T>({
  items,
  getItemKey,
  renderItem,
  empty,
  className,
  itemClassName,
  ordered = false,
  ...props
}: ListItemsProps<T>) {
  if (!items.length) return empty ?? null;
  const Element = ordered ? "ol" : "ul";
  return (
    <Element
      data-slot="list-items"
      className={cn("flex min-w-0 list-none flex-col gap-4", className)}
      {...props}
    >
      {items.map((item) => (
        <li
          key={getItemKey(item)}
          data-slot="list-item"
          className={cn("min-w-0", itemClassName)}
        >
          {renderItem(item)}
        </li>
      ))}
    </Element>
  );
}

export function ListEmpty({
  children,
  action,
  className,
  ...props
}: ComponentProps<"div"> & { action?: ReactNode }) {
  return (
    <div
      data-slot="list-empty"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

export function ListStatus({
  loading = false,
  error,
  loadingLabel,
  retryLabel,
  onRetry,
  initial = false,
}: {
  loading?: boolean;
  error?: string | null;
  loadingLabel: string;
  retryLabel: string;
  onRetry?: () => void;
  initial?: boolean;
}) {
  if (error)
    return (
      <Alert variant="destructive" data-slot="list-error">
        <AlertDescription>{error}</AlertDescription>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        ) : null}
      </Alert>
    );
  if (!loading) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="list-loading"
      className="flex flex-col gap-4"
    >
      <span className="text-sm text-muted-foreground">{loadingLabel}</span>
      {initial ? (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      ) : null}
    </div>
  );
}

export interface ListPaginationProps {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousHref?: string;
  nextHref?: string;
  previousLabel: string;
  nextLabel: string;
  label?: string;
}

/** Supports client paging callbacks or ordinary server-rendered navigation links. */
export function ListPagination({
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  previousHref,
  nextHref,
  previousLabel,
  nextLabel,
  label,
}: ListPaginationProps) {
  return (
    <nav
      data-slot="list-pagination"
      aria-label={label}
      className="flex items-center justify-between gap-3"
    >
      {previousHref && canPrevious ? (
        <a
          href={previousHref}
          className={buttonVariants({ variant: "outline" })}
        >
          <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
          {previousLabel}
        </a>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={!canPrevious}
          onClick={onPrevious}
        >
          <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
          {previousLabel}
        </Button>
      )}
      {nextHref && canNext ? (
        <a href={nextHref} className={buttonVariants({ variant: "outline" })}>
          {nextLabel}
          <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
        </a>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={!canNext}
          onClick={onNext}
        >
          {nextLabel}
          <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
        </Button>
      )}
    </nav>
  );
}

export function ListLoadMore({
  hasMore,
  loading,
  error,
  onLoadMore,
  loadingLabel,
  loadMoreLabel,
  retryLabel,
  children,
}: {
  hasMore: boolean;
  loading: boolean;
  error?: string | null;
  onLoadMore: () => void;
  loadingLabel: string;
  loadMoreLabel: string;
  retryLabel: string;
  children?: ReactNode;
}) {
  if (!hasMore && !error) return null;
  return (
    <div
      data-slot="list-load-more"
      className="flex flex-col items-center gap-3 py-2"
      aria-live="polite"
    >
      {children}
      <ListStatus
        loading={loading}
        error={error}
        loadingLabel={loadingLabel}
        retryLabel={retryLabel}
        onRetry={onLoadMore}
      />
      {!error && !loading ? (
        <Button type="button" variant="outline" onClick={onLoadMore}>
          {loadMoreLabel}
        </Button>
      ) : null}
    </div>
  );
}
