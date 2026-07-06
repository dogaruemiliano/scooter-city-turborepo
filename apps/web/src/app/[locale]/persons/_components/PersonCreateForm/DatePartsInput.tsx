import { Input } from "@repo/ui/components";

import { dateDigits } from "./date-utils";
import { invalidAria } from "./errors";
import type { DateParts } from "./types";

export function DatePartsInput({
  baseId,
  "aria-describedby": ariaDescribedBy,
  invalid = false,
  label,
  locale,
  value,
  onChange,
}: {
  baseId: string;
  "aria-describedby"?: string;
  invalid?: boolean;
  label: string;
  locale: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
}) {
  const dayPlaceholder = locale === "ro" ? "ZZ" : "DD";
  const monthPlaceholder = locale === "ro" ? "LL" : "MM";
  const yearPlaceholder = locale === "ro" ? "AAAA" : "YYYY";

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        id={`${baseId}-day`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={2}
        placeholder={dayPlaceholder}
        value={value.day}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            day: dateDigits(event.target.value, 2),
          })
        }
      />
      <span className="text-muted-foreground">/</span>
      <Input
        aria-label={`${label} ${monthPlaceholder}`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={2}
        placeholder={monthPlaceholder}
        value={value.month}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            month: dateDigits(event.target.value, 2),
          })
        }
      />
      <span className="text-muted-foreground">/</span>
      <Input
        aria-label={`${label} ${yearPlaceholder}`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalidAria(invalid)}
        inputMode="numeric"
        maxLength={4}
        placeholder={yearPlaceholder}
        value={value.year}
        className="min-w-0 flex-1"
        onChange={(event) =>
          onChange({
            ...value,
            year: dateDigits(event.target.value, 4),
          })
        }
      />
    </div>
  );
}
