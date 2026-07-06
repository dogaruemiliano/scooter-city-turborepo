"use client";

import { useId } from "react";

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";

export function SelectField<Value extends string>({
  label,
  value,
  values,
  labelForValue,
  onChange,
}: {
  label: string;
  value: Value;
  values: readonly Value[];
  labelForValue: (value: Value) => string;
  onChange: (value: Value) => void;
}) {
  const id = useId();

  return (
    <div className="grid gap-2">
      <Label id={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as Value)}
      >
        <SelectTrigger aria-labelledby={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {labelForValue(item)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
