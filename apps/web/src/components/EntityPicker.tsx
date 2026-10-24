"use client";

import { PersonSelect } from "./PersonSelect";
import { ScooterSelect } from "./ScooterSelect";

/** Compatibility entry point; entity pickers share their canonical card/sheet UI. */
export function EntityPicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "persons" | "scooters";
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return kind === "persons" ? (
    <PersonSelect label={label} value={value} onValueChange={onChange} />
  ) : (
    <ScooterSelect label={label} value={value} onValueChange={onChange} />
  );
}
