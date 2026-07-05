"use client";

import * as React from "react";
import { tokens } from "@repo/theme";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { cn } from "@repo/ui/lib/utils";

const MONTHS_IN_YEAR = 12;
const DAYS_IN_WEEK = 7;
const DEFAULT_MIN_YEAR = 1900;
const DEFAULT_MAX_YEAR = 2100;
const DEFAULT_WEEK_STARTS_ON = 1;
const WHEEL_SETTLE_DELAY_MS = tokens.motion.duration.fast;

const MONTH_INDEXES = Array.from(
  { length: MONTHS_IN_YEAR },
  (_, index) => index,
);

type DateOnly = {
  day: number;
  monthIndex: number;
  year: number;
};

type CalendarView = {
  monthIndex: number;
  year: number;
};

type CalendarPickerMode = "calendar" | "month-year";

export type CalendarPickerProps = {
  title: React.ReactNode;
  renderTrigger: React.ReactElement;
  triggerLabel: React.ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  defaultSelectorOpen?: boolean;
  defaultValue?: string | null;
  description?: React.ReactNode;
  locale?: string;
  maxYear?: number;
  minYear?: number;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
  open?: boolean;
  today?: string;
  value?: string | null;
  weekStartsOn?: 0 | 1;
};

export function CalendarPicker({
  className,
  contentClassName,
  defaultOpen,
  defaultSelectorOpen = false,
  defaultValue = null,
  description,
  locale,
  maxYear = DEFAULT_MAX_YEAR,
  minYear = DEFAULT_MIN_YEAR,
  onOpenChange,
  onValueChange,
  open,
  renderTrigger,
  title,
  today,
  triggerLabel,
  value,
  weekStartsOn = DEFAULT_WEEK_STARTS_ON,
}: CalendarPickerProps) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const selectedValue = value === undefined ? internalValue : value;
  const selectedDate = parseDateOnly(selectedValue);
  const todayDate = React.useMemo(
    () => parseDateOnly(today) ?? getTodayDateOnly(),
    [today],
  );
  const yearRange = React.useMemo(
    () => getYearRange(minYear, maxYear),
    [maxYear, minYear],
  );
  const defaultView = getInitialView(selectedDate, todayDate, yearRange);
  const [view, setView] = React.useState(defaultView);
  const [mode, setMode] = React.useState<CalendarPickerMode>(
    defaultSelectorOpen ? "month-year" : "calendar",
  );
  const resolvedLocale = locale ?? getDefaultLocale();
  const resolvedOpen = open === undefined ? internalOpen : open;

  React.useEffect(() => {
    const nextSelectedDate = parseDateOnly(selectedValue);

    if (nextSelectedDate) {
      setView(getInitialView(nextSelectedDate, todayDate, yearRange));
    }
  }, [selectedValue, todayDate, yearRange]);

  const setResolvedOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }

      if (!nextOpen) {
        setMode("calendar");
      }

      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const selectDate = React.useCallback(
    (date: DateOnly) => {
      const nextValue = formatDateOnly(date);

      if (value === undefined) {
        setInternalValue(nextValue);
      }

      setView({
        monthIndex: date.monthIndex,
        year: date.year,
      });
      onValueChange?.(nextValue);
      setResolvedOpen(false);
    },
    [onValueChange, setResolvedOpen, value],
  );

  const panel = (
    <CalendarPickerPanel
      className={contentClassName}
      description={description}
      locale={resolvedLocale}
      mode={mode}
      onModeChange={setMode}
      onSelectDate={selectDate}
      onViewChange={setView}
      selectedDate={selectedDate}
      surface={isMobile ? "sheet" : "popover"}
      title={title}
      todayDate={todayDate}
      view={view}
      weekStartsOn={weekStartsOn}
      yearRange={yearRange}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={resolvedOpen} onOpenChange={setResolvedOpen}>
        <SheetTrigger render={renderTrigger}>{triggerLabel}</SheetTrigger>
        <SheetContent
          side="bottom"
          className={cn(
            "max-h-[calc(100svh-var(--spacing-8))] overflow-y-auto rounded-t-2xl p-4 pb-6",
            className,
          )}
          showCloseButton={false}
        >
          {panel}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={resolvedOpen} onOpenChange={setResolvedOpen}>
      <PopoverTrigger render={renderTrigger}>{triggerLabel}</PopoverTrigger>
      <PopoverContent
        align="center"
        className={cn("w-96 gap-4 p-4", className)}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function CalendarPickerPanel({
  className,
  description,
  locale,
  mode,
  onModeChange,
  onSelectDate,
  onViewChange,
  selectedDate,
  surface,
  title,
  todayDate,
  view,
  weekStartsOn,
  yearRange,
}: {
  className?: string;
  description?: React.ReactNode;
  locale: string;
  mode: CalendarPickerMode;
  onModeChange: (mode: CalendarPickerMode) => void;
  onSelectDate: (date: DateOnly) => void;
  onViewChange: (view: CalendarView) => void;
  selectedDate: DateOnly | null;
  surface: "popover" | "sheet";
  title: React.ReactNode;
  todayDate: DateOnly;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  yearRange: YearRange;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {surface === "sheet" ? (
        <SheetHeader className="items-center p-0 text-center">
          <SheetTitle className="text-2xl font-bold">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="max-w-prose">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
      ) : (
        <PopoverHeader className="items-center text-center">
          <PopoverTitle className="text-lg font-semibold">{title}</PopoverTitle>
          {description ? (
            <PopoverDescription className="max-w-prose">
              {description}
            </PopoverDescription>
          ) : null}
        </PopoverHeader>
      )}

      <Card className="border-transparent bg-muted py-4 shadow-none">
        <CardContent className="flex flex-col gap-5 px-3">
          <CalendarHeader
            locale={locale}
            mode={mode}
            onModeChange={onModeChange}
            onViewChange={onViewChange}
            view={view}
            yearRange={yearRange}
          />

          {mode === "month-year" ? (
            <MonthYearSelector
              locale={locale}
              onDone={() => onModeChange("calendar")}
              onViewChange={onViewChange}
              view={view}
              yearRange={yearRange}
            />
          ) : (
            <MonthGrid
              locale={locale}
              onSelectDate={onSelectDate}
              selectedDate={selectedDate}
              todayDate={todayDate}
              view={view}
              weekStartsOn={weekStartsOn}
              yearRange={yearRange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarHeader({
  locale,
  mode,
  onModeChange,
  onViewChange,
  view,
  yearRange,
}: {
  locale: string;
  mode: CalendarPickerMode;
  onModeChange: (mode: CalendarPickerMode) => void;
  onViewChange: (view: CalendarView) => void;
  view: CalendarView;
  yearRange: YearRange;
}) {
  const previousView = addMonths(view, -1, yearRange);
  const nextView = addMonths(view, 1, yearRange);
  const canGoPrevious = !isSameView(previousView, view);
  const canGoNext = !isSameView(nextView, view);
  const monthYearLabel = formatMonthYear(view, locale);
  const selectorOpen = mode === "month-year";

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
      <Button
        aria-label="Previous month"
        disabled={selectorOpen || !canGoPrevious}
        onClick={() => onViewChange(previousView)}
        size="icon-lg"
        type="button"
        variant="ghost"
      >
        <ChevronLeftIcon />
      </Button>

      <Button
        aria-expanded={selectorOpen}
        aria-label="Choose month and year"
        className={cn(
          "justify-self-center text-lg font-semibold",
          selectorOpen && "text-primary hover:text-primary",
        )}
        onClick={() => onModeChange(selectorOpen ? "calendar" : "month-year")}
        type="button"
        variant="ghost"
      >
        {monthYearLabel}
        <ChevronDownIcon
          data-icon="inline-end"
          className={cn(
            "transition-transform duration-fast ease-standard",
            selectorOpen && "rotate-180",
          )}
        />
      </Button>

      <Button
        aria-label="Next month"
        disabled={selectorOpen || !canGoNext}
        onClick={() => onViewChange(nextView)}
        size="icon-lg"
        type="button"
        variant="ghost"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

function MonthGrid({
  locale,
  onSelectDate,
  selectedDate,
  todayDate,
  view,
  weekStartsOn,
  yearRange,
}: {
  locale: string;
  onSelectDate: (date: DateOnly) => void;
  selectedDate: DateOnly | null;
  todayDate: DateOnly;
  view: CalendarView;
  weekStartsOn: 0 | 1;
  yearRange: YearRange;
}) {
  const weekdays = getWeekdayLabels(locale, weekStartsOn);
  const dates = getVisibleDates(view, weekStartsOn);

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-fast ease-standard">
      <div className="grid grid-cols-7 gap-y-3">
        {weekdays.map((weekday) => (
          <div
            aria-hidden="true"
            className="flex h-10 items-center justify-center text-base font-semibold text-foreground"
            key={weekday}
          >
            {weekday}
          </div>
        ))}

        {dates.map((date) => {
          const dateValue = formatDateOnly(date);
          const isSelected = selectedDate
            ? isSameDate(date, selectedDate)
            : false;
          const isToday = isSameDate(date, todayDate);
          const isCurrentMonth = date.monthIndex === view.monthIndex;
          const isDisabled = isDateOutsideYearRange(date, yearRange);

          return (
            <div
              className="flex h-12 items-center justify-center"
              key={dateValue}
            >
              <Button
                aria-current={isToday ? "date" : undefined}
                aria-label={formatFullDate(date, locale)}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-full text-base font-medium",
                  !isSelected &&
                    "text-foreground hover:bg-secondary-hover active:bg-secondary-active",
                  !isCurrentMonth && "text-muted-foreground",
                  isToday && !isSelected && "border-primary text-primary",
                  isSelected && "bg-primary text-primary-foreground",
                )}
                disabled={isDisabled}
                onClick={() => onSelectDate(date)}
                size="icon-lg"
                type="button"
                variant={isSelected ? "default" : "ghost"}
              >
                {date.day}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthYearSelector({
  locale,
  onDone,
  onViewChange,
  view,
  yearRange,
}: {
  locale: string;
  onDone: () => void;
  onViewChange: (view: CalendarView) => void;
  view: CalendarView;
  yearRange: YearRange;
}) {
  const years = React.useMemo(() => {
    return Array.from(
      { length: yearRange.maxYear - yearRange.minYear + 1 },
      (_, index) => yearRange.minYear + index,
    );
  }, [yearRange.maxYear, yearRange.minYear]);
  const monthOptions = React.useMemo(
    () =>
      MONTH_INDEXES.map((monthIndex) => ({
        label: formatMonthName(monthIndex, locale),
        value: monthIndex,
      })),
    [locale],
  );
  const yearOptions = React.useMemo(
    () =>
      years.map((year) => ({
        label: String(year),
        value: year,
      })),
    [years],
  );
  const monthColumnRef = React.useRef<HTMLDivElement>(null);
  const yearColumnRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-fast ease-standard">
      <div className="relative grid h-72 grid-cols-2 gap-4 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 z-raised h-12 -translate-y-1/2 rounded-full bg-secondary"
        />
        <WheelColumn
          ariaLabel="Month"
          onScrollValueChange={(monthIndex) =>
            onViewChange({ ...view, monthIndex })
          }
          onSelect={(monthIndex) => onViewChange({ ...view, monthIndex })}
          options={monthOptions}
          ref={monthColumnRef}
          selectedValue={view.monthIndex}
        />
        <WheelColumn
          ariaLabel="Year"
          onScrollValueChange={(year) => onViewChange({ ...view, year })}
          onSelect={(year) => onViewChange({ ...view, year })}
          options={yearOptions}
          ref={yearColumnRef}
          selectedValue={view.year}
        />
      </div>

      <Button className="mt-5 w-full" onClick={onDone} type="button">
        Done
      </Button>
    </div>
  );
}

const WheelColumn = React.forwardRef<
  HTMLDivElement,
  {
    ariaLabel: string;
    onScrollValueChange: (value: number) => void;
    onSelect: (value: number) => void;
    options: Array<{ label: string; value: number }>;
    selectedValue: number;
  }
>(function WheelColumn(
  { ariaLabel, onScrollValueChange, onSelect, options, selectedValue },
  ref,
) {
  const frameRef = React.useRef<number | null>(null);
  const settleTimerRef = React.useRef<number | null>(null);
  const scrollElementRef = React.useRef<HTMLDivElement | null>(null);
  const scrollingRef = React.useRef(false);
  const centeredValueRef = React.useRef<number | null>(selectedValue);
  const setScrollElementRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      scrollElementRef.current = element;

      if (typeof ref === "function") {
        ref(element);
        return;
      }

      if (ref) {
        ref.current = element;
      }
    },
    [ref],
  );

  const syncWheel = React.useCallback(
    (element: HTMLElement) => {
      const centeredValue = getCenteredWheelValue(element);

      if (
        centeredValue !== null &&
        centeredValue !== centeredValueRef.current
      ) {
        centeredValueRef.current = centeredValue;
        onScrollValueChange(centeredValue);
      }

      return centeredValue;
    },
    [onScrollValueChange],
  );

  const snapValueIntoView = React.useCallback((value: number) => {
    const element = scrollElementRef.current;

    if (!element) {
      return;
    }

    scrollValueIntoView(element, value, "smooth");
  }, []);

  React.useEffect(() => {
    const element = scrollElementRef.current;

    if (!element) {
      return;
    }

    if (!scrollingRef.current) {
      scrollValueIntoView(element, selectedValue, "auto");
      centeredValueRef.current = selectedValue;
    }

    syncWheel(element);
  }, [options, selectedValue, syncWheel]);

  React.useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="relative z-raised min-w-0 overflow-hidden">
      <div
        aria-label={ariaLabel}
        className="relative z-raised flex h-72 snap-y snap-mandatory flex-col overflow-y-auto py-32 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          scrollingRef.current = true;

          if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
          }

          if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
          }

          const element = event.currentTarget;

          frameRef.current = window.requestAnimationFrame(() => {
            syncWheel(element);
          });

          settleTimerRef.current = window.setTimeout(() => {
            const centeredValue = syncWheel(element);

            scrollingRef.current = false;

            if (centeredValue !== null) {
              scrollValueIntoView(element, centeredValue, "smooth");
            }
          }, WHEEL_SETTLE_DELAY_MS);
        }}
        ref={setScrollElementRef}
        role="listbox"
        tabIndex={0}
      >
        {options.map((option) => {
          const selected = option.value === selectedValue;

          return (
            <button
              aria-selected={selected}
              className={cn(
                "relative z-raised flex h-12 shrink-0 snap-center items-center justify-center rounded-full px-3 text-2xl font-medium text-muted-foreground transition-colors duration-fast ease-standard",
                selected && "text-foreground",
              )}
              data-picker-option=""
              data-value={option.value}
              key={option.value}
              onClick={() => {
                scrollingRef.current = true;
                centeredValueRef.current = option.value;
                onSelect(option.value);
                snapValueIntoView(option.value);

                if (settleTimerRef.current !== null) {
                  window.clearTimeout(settleTimerRef.current);
                }

                settleTimerRef.current = window.setTimeout(() => {
                  scrollingRef.current = false;
                }, WHEEL_SETTLE_DELAY_MS);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-raised h-20 bg-gradient-to-b from-muted via-muted to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-20 bg-gradient-to-t from-muted via-muted to-transparent"
      />
    </div>
  );
});

WheelColumn.displayName = "WheelColumn";

type YearRange = {
  minYear: number;
  maxYear: number;
};

function getYearRange(minYear: number, maxYear: number): YearRange {
  const normalizedMinYear = Math.trunc(minYear);
  const normalizedMaxYear = Math.trunc(maxYear);

  return {
    minYear: Math.min(normalizedMinYear, normalizedMaxYear),
    maxYear: Math.max(normalizedMinYear, normalizedMaxYear),
  };
}

function getInitialView(
  selectedDate: DateOnly | null,
  todayDate: DateOnly,
  yearRange: YearRange,
): CalendarView {
  const date = selectedDate ?? todayDate;

  return {
    monthIndex: date.monthIndex,
    year: clamp(date.year, yearRange.minYear, yearRange.maxYear),
  };
}

function addMonths(
  view: CalendarView,
  amount: number,
  yearRange: YearRange,
): CalendarView {
  const monthCount = view.year * MONTHS_IN_YEAR + view.monthIndex + amount;
  const nextYear = Math.floor(monthCount / MONTHS_IN_YEAR);
  const nextMonthIndex = monthCount % MONTHS_IN_YEAR;
  const normalizedMonthIndex =
    nextMonthIndex < 0 ? nextMonthIndex + MONTHS_IN_YEAR : nextMonthIndex;
  const normalizedYear = nextMonthIndex < 0 ? nextYear - 1 : nextYear;

  if (normalizedYear < yearRange.minYear) {
    return {
      monthIndex: 0,
      year: yearRange.minYear,
    };
  }

  if (normalizedYear > yearRange.maxYear) {
    return {
      monthIndex: MONTHS_IN_YEAR - 1,
      year: yearRange.maxYear,
    };
  }

  return {
    monthIndex: normalizedMonthIndex,
    year: normalizedYear,
  };
}

function getVisibleDates(view: CalendarView, weekStartsOn: 0 | 1): DateOnly[] {
  const firstOfMonth = new Date(Date.UTC(view.year, view.monthIndex, 1));
  const startOffset =
    (firstOfMonth.getUTCDay() - weekStartsOn + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const startDate = new Date(
    Date.UTC(view.year, view.monthIndex, 1 - startOffset),
  );
  const lastOfMonth = new Date(Date.UTC(view.year, view.monthIndex + 1, 0));
  const endOffset =
    (weekStartsOn + DAYS_IN_WEEK - 1 - lastOfMonth.getUTCDay() + DAYS_IN_WEEK) %
    DAYS_IN_WEEK;
  const dateCount = startOffset + lastOfMonth.getUTCDate() + endOffset;

  return Array.from({ length: dateCount }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);

    return {
      day: date.getUTCDate(),
      monthIndex: date.getUTCMonth(),
      year: date.getUTCFullYear(),
    };
  });
}

function getWeekdayLabels(locale: string, weekStartsOn: 0 | 1): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
  });
  const sunday = new Date(Date.UTC(2026, 6, 5));

  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + weekStartsOn + index);

    return formatter.format(date).slice(0, 1).toLocaleUpperCase(locale);
  });
}

function parseDateOnly(value: string | null | undefined): DateOnly | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    day,
    monthIndex: month - 1,
    year,
  };
}

function getTodayDateOnly(): DateOnly {
  const today = new Date();

  return {
    day: today.getDate(),
    monthIndex: today.getMonth(),
    year: today.getFullYear(),
  };
}

function formatDateOnly(date: DateOnly): string {
  return `${date.year}-${padDatePart(date.monthIndex + 1)}-${padDatePart(
    date.day,
  )}`;
}

function formatMonthYear(view: CalendarView, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(view.year, view.monthIndex, 1)));
}

function formatMonthName(monthIndex: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, monthIndex, 1)));
}

function formatFullDate(date: DateOnly, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(date.year, date.monthIndex, date.day)));
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function isSameDate(left: DateOnly, right: DateOnly): boolean {
  return (
    left.day === right.day &&
    left.monthIndex === right.monthIndex &&
    left.year === right.year
  );
}

function isSameView(left: CalendarView, right: CalendarView): boolean {
  return left.monthIndex === right.monthIndex && left.year === right.year;
}

function isDateOutsideYearRange(date: DateOnly, yearRange: YearRange): boolean {
  return date.year < yearRange.minYear || date.year > yearRange.maxYear;
}

function getCenteredWheelValue(element: HTMLElement): number | null {
  const options = Array.from(
    element.querySelectorAll<HTMLElement>("[data-picker-option]"),
  );
  const elementRect = element.getBoundingClientRect();
  const center = elementRect.top + elementRect.height / 2;
  let closestOption: HTMLElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const optionRect = option.getBoundingClientRect();
    const optionCenter = optionRect.top + optionRect.height / 2;
    const distance = Math.abs(center - optionCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestOption = option;
    }
  }

  if (!closestOption) {
    return null;
  }

  const value = Number(closestOption.dataset.value);

  return Number.isFinite(value) ? value : null;
}

function scrollValueIntoView(
  element: HTMLElement | null,
  value: number,
  behavior: ScrollBehavior,
) {
  const option = element?.querySelector<HTMLElement>(`[data-value="${value}"]`);

  option?.scrollIntoView({
    behavior,
    block: "center",
  });
}

function getDefaultLocale(): string {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
