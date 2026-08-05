"use client";

import { v1 } from "@repo/api-shared";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  buttonVariants,
} from "@repo/ui/components";
import { MailIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { whatsappHrefForPhone } from "./helpers";

export function PersonContactSheet({ person }: { person: v1.persons.Person }) {
  const t = useTranslations("persons");
  const fullName = `${person.firstName} ${person.lastName}`;
  const contactOptionClassName = buttonVariants({
    variant: "outline",
    className:
      "h-auto min-w-0 flex-col gap-2 px-2 py-4 text-center whitespace-normal",
  });

  return (
    <BottomSheet>
      <BottomSheetTrigger
        render={<Button type="button" size="lg" className="w-full sm:w-auto" />}
      >
        <MessageCircleIcon data-icon="inline-start" />
        {t("actions.contact")}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>
            {t("detail.contact.title", { name: fullName })}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {t("detail.contact.description")}
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody safeAreaBottom>
          <div className="grid grid-cols-3 gap-2">
            <BottomSheetClose
              aria-label={t("actions.callPerson", { name: fullName })}
              render={
                <a
                  href={`tel:${person.phone}`}
                  className={contactOptionClassName}
                />
              }
            >
              <PhoneIcon aria-hidden="true" className="size-8" />
              <span className="text-xs font-medium">{t("actions.call")}</span>
            </BottomSheetClose>
            <BottomSheetClose
              aria-label={t("actions.whatsappPerson", { name: fullName })}
              render={
                <a
                  href={whatsappHrefForPhone(person.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className={contactOptionClassName}
                />
              }
            >
              <span
                aria-hidden="true"
                data-contact-icon="whatsapp"
                className="size-8 shrink-0 bg-foreground [mask-image:url('/icons/whatsapp-icon.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
              />
              <span className="text-xs font-medium">
                {t("actions.whatsapp")}
              </span>
            </BottomSheetClose>
            <BottomSheetClose
              aria-label={t("actions.emailPerson", { name: fullName })}
              render={
                <a
                  href={`mailto:${person.email}`}
                  className={contactOptionClassName}
                />
              }
            >
              <MailIcon aria-hidden="true" className="size-8" />
              <span className="text-xs font-medium">{t("actions.email")}</span>
            </BottomSheetClose>
          </div>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
