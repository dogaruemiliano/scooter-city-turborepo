/** Opacity for interaction feedback and document protection. */
export const opacity = {
  dragGhost: 0.3,
  imagePlaceholder: 0.5,
  clientDocumentOverlay: 0.1,
} as const;

export type Opacity = typeof opacity;

/** Quintic smootherstep, sampled densely for CSS's piecewise gradient interpolation. */
const fadeSegments = 32;
const softFadeStops = Array.from({ length: fadeSegments + 1 }, (_, index) => {
  const t = index / fadeSegments;
  return {
    position: t,
    opacity: 6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3,
  };
});

// Fill the entire overlay: a fixed fade length leaves an opaque band behind the controls.
function overlayGradient(direction: string) {
  return `linear-gradient(${direction}, ${softFadeStops
    .map(
      ({ position, opacity }) =>
        `color-mix(in srgb, var(--document-preview-scrim) ${opacity * 100}%, transparent) ${position * 100}%`,
    )
    .join(", ")})`;
}

export const softFade = {
  stops: softFadeStops,
  toTop: overlayGradient("to top"),
  toBottom: overlayGradient("to bottom"),
} as const;

/** The inverse of the overlay curve preserves content until it approaches an edge. */
export const scrollFade = {
  softMask: `linear-gradient(to right, ${[
    ...softFadeStops
      .slice()
      .reverse()
      .map(
        ({ position, opacity }) =>
          `color-mix(in srgb, currentColor ${(1 - opacity) * 100}%, var(--scroll-fade-start)) calc(var(--scroll-fade-width) * ${1 - position})`,
      ),
    ...softFadeStops.map(
      ({ position, opacity }) =>
        `color-mix(in srgb, currentColor ${(1 - opacity) * 100}%, var(--scroll-fade-end)) calc(100% - var(--scroll-fade-width) * ${1 - position})`,
    ),
  ].join(", ")})`,
} as const;
