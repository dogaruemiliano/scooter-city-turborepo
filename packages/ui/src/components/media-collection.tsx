"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./button";
import {
  MediaViewer,
  type MediaItem,
  type MediaViewerProps,
} from "./media-viewer";

export type MediaCollectionItem = MediaItem & {
  load?: () => Promise<File>;
  onReplace?: (file: File) => void | Promise<void>;
  onRemove?: () => void;
  validate?: (file: File) => string | null;
  overlay?: ReactNode;
};

const CollectionContext = createContext<{
  open: (key: string | null | undefined) => boolean;
} | null>(null);

export function useMediaCollection() {
  return useContext(CollectionContext);
}

/** A provider represents exactly one list, never all media on a page. */
export function MediaCollection({
  items,
  children,
  ...labels
}: Omit<
  MediaViewerProps,
  "open" | "onOpenChange" | "items" | "activeId" | "onActiveIdChange"
> & {
  items: readonly MediaCollectionItem[];
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, File>>({});
  const [loaded, setLoaded] = useState<{ id: string; file: File }>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const previousIndex = useRef(0);
  const index = items.findIndex((item) => item.id === activeId);
  const active = items[index];
  const loadRef = useRef(active?.load);
  loadRef.current = active?.load;
  const [attempt, setAttempt] = useState(0);

  function close() {
    if (savingRef.current) return;
    setActiveId(null);
    setEdits({});
    setError(null);
    setLoaded(undefined);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  }
  useEffect(() => {
    if (activeId && index < 0) {
      const next = items[Math.min(previousIndex.current, items.length - 1)];
      if (next) setActiveId(next.id);
      else close();
    } else previousIndex.current = index;
  }, [activeId, index, items]);
  useEffect(() => {
    if (!activeId || active?.src || active?.file || !loadRef.current) return;
    let cancelled = false;
    setError(null);
    void loadRef
      .current()
      .then((file) => {
        if (!cancelled) setLoaded({ id: activeId, file });
      })
      .catch(() => {
        if (!cancelled) setError(labels.pdfLabels.error);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, active?.src, active?.file, attempt, labels.pdfLabels.error]);

  const values = items.map((item) => {
    const file =
      edits[item.id] ?? (loaded?.id === item.id ? loaded.file : item.file);
    return file
      ? {
          ...item,
          file,
          src: null,
          contentType: file.type,
          fileName: file.name,
        }
      : item;
  });

  return (
    <CollectionContext
      value={{
        open: (key) => {
          if (!key || savingRef.current) return false;
          const item = items.find(
            (item) => item.id === key || item.src === key,
          );
          if (!item) return false;
          opener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          setActiveId(item.id);
          setEdits({});
          setError(null);
          return true;
        },
      }}
    >
      {children}
      {activeId ? (
        <MediaViewer
          {...labels}
          title={active?.fileName ?? labels.title}
          imageAlt={active?.fileName ?? labels.imageAlt}
          open
          activeId={activeId}
          items={values}
          onActiveIdChange={(id) => {
            if (!savingRef.current) {
              setActiveId(id);
              setError(null);
            }
          }}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          disabled={labels.disabled || saving}
          saving={saving}
          error={error}
          bottomOverlay={active?.overlay}
          onRemove={active?.onRemove}
          onCrop={
            active?.onReplace
              ? (file) => {
                  const problem = active.validate?.(file);
                  if (problem) throw new Error(problem);
                  setEdits((current) => ({ ...current, [active.id]: file }));
                }
              : undefined
          }
          onSave={
            Object.keys(edits).some((id) =>
              items.some((item) => item.id === id),
            )
              ? async () => {
                  if (savingRef.current) return;
                  savingRef.current = true;
                  setSaving(true);
                  setError(null);
                  try {
                    for (const item of items) {
                      const file = edits[item.id];
                      if (file) {
                        const problem = item.validate?.(file);
                        if (problem) throw new Error(problem);
                      }
                    }
                    for (const item of items) {
                      const file = edits[item.id];
                      if (file) {
                        await item.onReplace?.(file);
                        setEdits((current) => {
                          const next = { ...current };
                          delete next[item.id];
                          return next;
                        });
                      }
                    }
                    savingRef.current = false;
                    close();
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : labels.pdfLabels.error,
                    );
                  } finally {
                    savingRef.current = false;
                    setSaving(false);
                  }
                }
              : undefined
          }
          footer={
            error && active?.load ? (
              <Button
                type="button"
                variant="text"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {labels.pdfLabels.retry}
              </Button>
            ) : (
              labels.footer
            )
          }
        />
      ) : null}
    </CollectionContext>
  );
}
