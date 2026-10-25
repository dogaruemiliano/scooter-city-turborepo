"use client";

import type { PersonSummary } from "./PersonIdentity";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
} from "@repo/ui/components";
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PersonContactActions } from "@/components/PersonContactActions";

export function PersonContactSheet({ person }: { person: PersonSummary }) {
  const t = useTranslations("persons");
  const fullName = `${person.firstName} ${person.lastName}`;

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
          <PersonContactActions person={person} closeSheet />
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
