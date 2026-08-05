"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  applyThemePreference,
  EXPLICIT_THEMES,
  type ThemePreference,
} from "../lib/theme-cookie";

const THEME_OPTIONS: readonly ThemePreference[] = [
  ...EXPLICIT_THEMES,
  "system",
];

export function ThemeToggle({
  initialPreference,
}: {
  initialPreference: ThemePreference;
}) {
  const t = useTranslations("theme");
  const [pref, setPref] = useState<ThemePreference>(initialPreference);

  const set = (next: ThemePreference) => {
    applyThemePreference(next);
    setPref(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="inline-flex items-center gap-1 rounded-full border border-border p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const selected = pref === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => set(option)}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition-colors " +
              (selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t(`options.${option}`)}
          </button>
        );
      })}
    </div>
  );
}
