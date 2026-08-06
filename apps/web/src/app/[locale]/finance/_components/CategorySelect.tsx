"use client";

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  Label,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useRef, useMemo, useState } from "react";

interface CategorySelectCategory {
  id: string;
  label?: string;
  name?: string;
  parentCategoryId?: string | null;
  keywords?: readonly string[];
}

interface CategorySelectProps {
  id: string;
  label: string;
  value: string | null;
  onChange(value: string | null): void;
  categories: readonly CategorySelectCategory[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

type VirtualizedItem =
  | { type: "header"; parentId: string | null; parentName: string }
  | { type: "category"; category: CategorySelectCategory };

export function CategorySelect({
  id,
  label,
  value,
  onChange,
  categories,
  placeholder = "Select category",
  searchPlaceholder = "Search categories",
  emptyMessage = "No categories found",
  error,
  required = false,
  disabled = false,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === value),
    [categories, value],
  );

  const filteredCategories = useMemo(() => {
    if (!query.trim()) return categories;
    const lowerQuery = query.toLowerCase();
    return categories.filter((category) => {
      const searchTerms = [
        category.label ?? category.name,
        ...(category.keywords ?? []),
      ];
      return searchTerms.some(
        (term) => term && term.toLowerCase().includes(lowerQuery),
      );
    });
  }, [categories, query]);

  const groupedAndFlattenedItems = useMemo(() => {
    const items: VirtualizedItem[] = [];
    const parentMap = new Map<string | null, CategorySelectCategory[]>();

    // Group categories by parent
    for (const category of filteredCategories) {
      if (
        category.parentCategoryId === null ||
        category.parentCategoryId === undefined
      ) {
        const key = category.id;
        if (!parentMap.has(key)) {
          parentMap.set(key, []);
        }
      }
    }

    for (const category of filteredCategories) {
      const parentId =
        category.parentCategoryId === null ||
        category.parentCategoryId === undefined
          ? category.id
          : category.parentCategoryId;

      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, []);
      }
      const group = parentMap.get(parentId)!;
      if (!group.includes(category)) {
        group.push(category);
      }
    }

    // Flatten to virtualized format
    for (const [parentId, groupCats] of parentMap) {
      const parent = filteredCategories.find((c) => c.id === parentId);
      if (parent && groupCats.length > 0) {
        items.push({
          type: "header",
          parentId,
          parentName: parent.label ?? parent.name ?? "",
        });
        for (const cat of groupCats) {
          items.push({ type: "category", category: cat });
        }
      }
    }

    return items;
  }, [filteredCategories]);

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
  };

  const triggerLabel =
    selectedCategory?.label ?? selectedCategory?.name ?? placeholder;

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: groupedAndFlattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    gap: 0,
  });

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger
          render={
            <button
              type="button"
              id={id}
              disabled={disabled || categories.length === 0}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-base text-left outline-none transition-colors duration-fast ease-standard focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm",
              )}
            >
              <span className="truncate text-foreground">{triggerLabel}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </button>
          }
        />

        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>{label}</BottomSheetTitle>
          </BottomSheetHeader>

          <BottomSheetBody>
            <div className="flex flex-col gap-4">
              <div className="flex h-10 items-center rounded-lg border border-input bg-background px-3 transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none size-4 shrink-0 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </button>
                )}
              </div>

              {groupedAndFlattenedItems.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <div
                  ref={parentRef}
                  className="max-h-64 overflow-y-auto overscroll-contain"
                >
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const item = groupedAndFlattenedItems[virtualItem.index];
                      if (!item) return null;

                      if (item.type === "header") {
                        return (
                          <div
                            key={`header-${item.parentId ?? "null"}`}
                            data-index={virtualItem.index}
                            className="absolute left-0 right-0 top-0 w-full bg-popover px-2 py-1 text-xs font-medium text-muted-foreground"
                            style={{
                              transform: `translateY(${virtualItem.start}px)`,
                              height: `${virtualItem.size}px`,
                            }}
                          >
                            {item.parentName}
                          </div>
                        );
                      }

                      const { category } = item;
                      return (
                        <div
                          key={`category-${category.id}`}
                          data-index={virtualItem.index}
                          className="absolute left-0 right-0 top-0 w-full"
                          style={{
                            transform: `translateY(${virtualItem.start}px)`,
                            height: `${virtualItem.size}px`,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelect(category.id)}
                            className={cn(
                              "relative flex h-full w-full items-center gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring",
                              value === category.id
                                ? "bg-accent text-accent-foreground font-medium"
                                : "text-foreground hover:bg-accent/50",
                            )}
                          >
                            <span className="truncate flex-1">
                              {category.label ?? category.name}
                            </span>
                            {value === category.id && (
                              <div className="flex size-4 shrink-0 items-center justify-center">
                                ✓
                              </div>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </BottomSheetBody>

          <BottomSheetFooter>
            <BottomSheetClose
              render={<Button type="button" variant="outline" />}
            >
              Close
            </BottomSheetClose>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
