"use client";

import { Button } from "@repo/ui/components";
import type { RefObject } from "react";

const EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "icloud.com", "outlook.com"];

export function EmailDomainSuggestions({
  email,
  onChange,
  inputRef,
  disabled = false,
}: {
  email: string;
  onChange: (email: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) {
  const localPart = email.trim().split("@")[0] ?? "";

  return (
    <div className="flex flex-wrap gap-1">
      {EMAIL_DOMAINS.map((domain) => (
        <Button
          key={domain}
          type="button"
          variant="secondary"
          size="xs"
          className="h-auto rounded-full px-(--spacing-1-5) py-1 md:h-auto"
          disabled={disabled || !localPart}
          onClick={() => {
            onChange(`${localPart}@${domain}`);
            inputRef.current?.focus();
          }}
        >
          @{domain}
        </Button>
      ))}
    </div>
  );
}
