"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components";
import type { MouseEvent as ReactMouseEvent } from "react";

interface AppPaginationProps {
  page: number;
  totalPages: number;
  disabled: boolean;
  label: string;
  previousText: string;
  previousAriaLabel: string;
  nextText: string;
  nextAriaLabel: string;
  moreLabel: string;
  onPageChange: (page: number) => void;
}

export function AppPagination({
  page,
  totalPages,
  disabled,
  label,
  previousText,
  previousAriaLabel,
  nextText,
  nextAriaLabel,
  moreLabel,
  onPageChange,
}: AppPaginationProps) {
  const previousDisabled = disabled || page <= 1;
  const nextDisabled = disabled || page >= totalPages;

  return (
    <Pagination aria-label={label} className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            text={previousText}
            aria-label={previousAriaLabel}
            {...pageLinkProps(previousDisabled, page - 1, onPageChange)}
          />
        </PaginationItem>
        {visiblePages(page, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`${item}-${index}`}>
              <PaginationEllipsis srLabel={moreLabel} />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                isActive={item === page}
                {...pageLinkProps(
                  disabled || item === page,
                  item,
                  onPageChange,
                )}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            text={nextText}
            aria-label={nextAriaLabel}
            {...pageLinkProps(nextDisabled, page + 1, onPageChange)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function pageLinkProps(
  disabled: boolean,
  page: number,
  onPageChange: (page: number) => void,
) {
  return {
    href: "#",
    "aria-disabled": disabled,
    tabIndex: disabled ? -1 : undefined,
    className: disabled ? "pointer-events-none opacity-50" : undefined,
    onClick(event: ReactMouseEvent<HTMLAnchorElement>) {
      event.preventDefault();
      if (!disabled) {
        onPageChange(page);
      }
    },
  };
}

function visiblePages(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) {
    pages.push("ellipsis");
  }

  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }

  if (end < totalPages - 1) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);
  return pages;
}
