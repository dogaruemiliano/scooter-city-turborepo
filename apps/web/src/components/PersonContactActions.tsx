"use client";

import { Fragment } from "react";
import { BottomSheetClose, Button, buttonVariants } from "@repo/ui/components";
import { MailIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PersonSummary } from "./PersonIdentity";
import { whatsappHrefForPhone } from "@/lib/person-contact";

/** Contact navigation stays outside selectable cards; no messages are sent here. */
export function PersonContactActions({
  person,
  closeSheet = false,
}: {
  person: PersonSummary;
  closeSheet?: boolean;
}) {
  const t = useTranslations("persons");
  const name = `${person.firstName} ${person.lastName}`;
  const iconClass = "size-8";
  const actions = [
    {
      key: "email",
      label: t("actions.email"),
      accessible: t("actions.emailPerson", { name }),
      href: person.email ? `mailto:${person.email}` : undefined,
      icon: <MailIcon aria-hidden="true" className={iconClass} />,
    },
    {
      key: "call",
      label: t("actions.call"),
      accessible: t("actions.callPerson", { name }),
      href: person.phone ? `tel:${person.phone}` : undefined,
      icon: <PhoneIcon aria-hidden="true" className={iconClass} />,
    },
    {
      key: "whatsapp",
      label: t("actions.whatsapp"),
      accessible: t("actions.whatsappPerson", { name }),
      href: person.phone?.replace(/\D/g, "")
        ? whatsappHrefForPhone(person.phone)
        : undefined,
      icon: (
        <span
          aria-hidden="true"
          data-contact-icon="whatsapp"
          className={`${iconClass} shrink-0 bg-foreground [mask-image:url('/icons/whatsapp-icon.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]`}
        />
      ),
    },
  ];
  const className = buttonVariants({
    variant: "outline",
    size: "default",
    className:
      "h-auto min-w-0 flex-col gap-2 px-2 py-4 text-center whitespace-normal",
  });
  return (
    <div data-slot="person-contact-actions" className="grid grid-cols-3 gap-2">
      {actions.map((action) => {
        const content = (
          <>
            {action.icon}
            <span className="text-xs font-medium">{action.label}</span>
          </>
        );
        const link = (
          <a
            aria-label={action.accessible}
            href={action.href}
            target={action.key === "whatsapp" ? "_blank" : undefined}
            rel={action.key === "whatsapp" ? "noreferrer" : undefined}
            className={className}
          >
            {content}
          </a>
        );
        const control = !action.href ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled
            aria-label={action.accessible}
            className={className}
          >
            {content}
          </Button>
        ) : closeSheet ? (
          <BottomSheetClose nativeButton={false} role="link" render={link}>
            {content}
          </BottomSheetClose>
        ) : (
          link
        );
        return <Fragment key={action.key}>{control}</Fragment>;
      })}
    </div>
  );
}
