"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Badge, FormSection } from "@repo/ui/components";
import { HorizontalScrollArea } from "@repo/ui/components/horizontal-scroll-area";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import { MediaCollection } from "@repo/ui/components/media-collection";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { useMediaViewerLabels } from "@/components/useMediaViewerLabels";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";

/** Read-only documents and compliance evidence share a navigable viewer. */
export function ScooterDetailDocuments({
  documents,
  children,
}: {
  documents: v1.scooters.ScooterDocument[];
  children?: ReactNode;
}) {
  const t = useTranslations("scooters.documents");
  const labels = useMediaViewerLabels();
  const user = useOptionalSession()?.user;
  if (!canAccess(user, "scooter_documents.read")) return null;
  const entries = v1.scooters.scooterDocumentDisplayEntries(documents);
  const cards = entries.map((entry) => {
    const file = entry.clientCopy ? entry.document.clientCopy! : entry.document;
    return {
      id: entry.clientCopy ? `${entry.document.id}-copy` : entry.document.id,
      src: webApi.url(file.contentUrl),
      fileName: file.fileName,
      contentType: file.contentType,
      entry,
    };
  });
  const items = [
    ...new Map(
      cards.map(({ id, src, fileName, contentType }) => [
        id,
        { id, src, fileName, contentType },
      ]),
    ).values(),
  ];

  return (
    <MediaCollection
      {...labels}
      title={t("title")}
      imageAlt={t("title")}
      items={items}
    >
      <FormSection title={t("title")} columns={1} panel>
        {cards.length ? (
          <HorizontalScrollArea
            label={t("title")}
            fadeEdges="always"
            fadeWidth="var(--card-spacing)"
            className="-mx-(--card-spacing) w-auto"
            snap
            scrollbarVisibility="desktop"
          >
            <ul className="flex w-max gap-3 px-(--card-spacing) py-1">
              {cards.map(({ entry, ...item }) => (
                <li
                  key={`${item.id}-${entry.type}`}
                  className="w-64 shrink-0 snap-start"
                >
                  <DocumentPreview
                    {...labels}
                    {...item}
                    mediaId={item.id}
                    layout="paper"
                    label={t(`compact.${entry.type}`)}
                    triggerLabel={t("preview", { name: item.fileName })}
                    title={item.fileName}
                    imageAlt={item.fileName}
                    open={false}
                    onOpenChange={() => {}}
                    headerOverlay={
                      <span className="truncate py-2 text-sm font-medium">
                        {item.fileName}
                      </span>
                    }
                    bottomOverlay={
                      <>
                        <Badge variant="secondary">
                          {t(`compact.${entry.type}`)}
                        </Badge>
                        {entry.clientCopy ? (
                          <Badge>{t("clientCopy")}</Badge>
                        ) : null}
                        {entry.badge ? (
                          <Badge variant="outline">
                            {t(`lifecycle.${entry.badge}`)}
                          </Badge>
                        ) : null}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </HorizontalScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </FormSection>
      {children}
    </MediaCollection>
  );
}
