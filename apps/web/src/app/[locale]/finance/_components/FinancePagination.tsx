import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components";

interface FinancePaginationProps {
  pageCount: number;
  previousHref?: string;
  nextHref?: string;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
}

export function FinancePagination({
  pageCount,
  previousHref,
  nextHref,
  previousLabel,
  nextLabel,
  pageLabel,
}: FinancePaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <Pagination>
      <PaginationContent>
        {previousHref ? (
          <PaginationItem>
            <PaginationPrevious
              href={previousHref}
              text={previousLabel}
              aria-label={previousLabel}
            />
          </PaginationItem>
        ) : null}
        <PaginationItem>
          <span className="px-3 text-sm text-muted-foreground">
            {pageLabel}
          </span>
        </PaginationItem>
        {nextHref ? (
          <PaginationItem>
            <PaginationNext
              href={nextHref}
              text={nextLabel}
              aria-label={nextLabel}
            />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
