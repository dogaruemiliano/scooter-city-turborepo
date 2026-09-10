"use client";

import type { v1 } from "@repo/api-shared";
import { cn } from "@repo/ui/lib/utils";
import {
  BanknoteIcon,
  CircleDotIcon,
  CircleIcon,
  LandmarkIcon,
  UserRoundIcon,
} from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import { useFormFieldControl } from "@/components/form/FormField";

export function FundingDestinationPicker({
  accounts,
  labelFor,
}: {
  accounts: readonly v1.finance.LedgerAccount[];
  labelFor: (account: v1.finance.LedgerAccount) => {
    title: string;
    detail: string;
  };
}) {
  const { control } = useFormContext();
  const { error, errorId, id, name, required } = useFormFieldControl();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          role="radiogroup"
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className="grid divide-y divide-border overflow-hidden rounded-lg border border-border md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          {accounts.map((account, index) => {
            const selected = field.value === account.id;
            const copy = labelFor(account);
            const Icon = iconFor(account.role);
            const optionId = `${id}-${index}`;

            return (
              <label
                key={account.id}
                htmlFor={optionId}
                className={cn(
                  "flex min-h-20 cursor-pointer items-center gap-3 p-3 transition-colors duration-fast ease-standard focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring hover:bg-muted/60",
                  selected ? "bg-muted text-foreground" : "bg-background",
                )}
              >
                <input
                  ref={field.ref}
                  id={optionId}
                  type="radio"
                  name={field.name}
                  value={account.id}
                  checked={selected}
                  onBlur={field.onBlur}
                  onChange={() => field.onChange(account.id)}
                  className="sr-only"
                />
                {selected ? (
                  <CircleDotIcon
                    className="size-5 shrink-0 text-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleIcon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground",
                    selected && "text-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {copy.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {copy.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    />
  );
}

function iconFor(role: v1.finance.LedgerAccountRole) {
  if (role === "BANK") return LandmarkIcon;
  if (role === "CASH_REGISTER") return BanknoteIcon;
  return UserRoundIcon;
}
