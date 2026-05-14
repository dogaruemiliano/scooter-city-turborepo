"use client";

import { useState } from "react";
import {
  applyThemePreference,
  type ThemePreference,
} from "../lib/theme-cookie";

export function ThemeToggle({
  initialPreference,
}: {
  initialPreference: ThemePreference;
}) {
  const [pref, setPref] = useState<ThemePreference>(initialPreference);

  const set = (next: ThemePreference) => {
    applyThemePreference(next);
    setPref(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-pill border border-border-default p-1"
    >
      {(["light", "dark", "system"] as const).map((option) => {
        const selected = pref === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => set(option)}
            className={
              "rounded-pill px-3 py-1 text-sm font-medium transition-colors " +
              (selected
                ? "bg-surface-action text-text-on-action"
                : "text-text-secondary hover:text-text-primary")
            }
          >
            {option[0]!.toUpperCase() + option.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
