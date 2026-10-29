import { semanticBlur } from "@repo/theme";

/** Decorative fill behind the uncropped document; never exposed as a second preview. */
export function DocumentPreviewBackdrop({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="document-preview-backdrop"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span
        className="absolute -inset-3"
        style={{ filter: `blur(${semanticBlur.documentPreview}px)` }}
      >
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </span>
      <span className="absolute inset-0 bg-media-scrim" />
    </span>
  );
}
