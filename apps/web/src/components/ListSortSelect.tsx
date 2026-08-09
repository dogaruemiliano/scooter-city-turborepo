import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import type { ReactNode } from "react";

interface ListSortSelectProps<Value extends string> {
  getOptionLabel: (value: Value) => ReactNode;
  id: string;
  label: string;
  onValueChange: (value: Value) => void;
  value: Value;
  values: readonly Value[];
}

export function ListSortSelect<Value extends string>({
  getOptionLabel,
  id,
  label,
  onValueChange,
  value,
  values,
}: ListSortSelectProps<Value>) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select<Value>
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue);
          }
        }}
      >
        <SelectTrigger
          id={id}
          className="w-auto border-transparent bg-transparent px-0 text-muted-foreground hover:text-foreground focus-visible:border-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((optionValue) => (
            <SelectItem key={optionValue} value={optionValue}>
              {getOptionLabel(optionValue)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
