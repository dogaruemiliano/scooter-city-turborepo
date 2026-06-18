/**
 * Shadow tokens. Web uses box-shadow strings; native uses iOS shadow props + Android elevation.
 * The same logical token (sm/md/lg/xl) renders the closest equivalent on each platform.
 */
export type NativeShadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type ShadowToken = {
  web: string;
  native: NativeShadow;
};

export const shadow: Record<"none" | "sm" | "md" | "lg" | "xl", ShadowToken> = {
  none: {
    web: "none",
    native: {
      shadowColor: "oklch(0 0 0)",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  sm: {
    web: "0 1px 2px 0 oklch(0 0 0 / 0.05)",
    native: {
      shadowColor: "oklch(0 0 0)",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  md: {
    web: "0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1)",
    native: {
      shadowColor: "oklch(0 0 0)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
  },
  lg: {
    web: "0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1)",
    native: {
      shadowColor: "oklch(0 0 0)",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 6,
    },
  },
  xl: {
    web: "0 20px 25px -5px oklch(0 0 0 / 0.1), 0 8px 10px -6px oklch(0 0 0 / 0.1)",
    native: {
      shadowColor: "oklch(0 0 0)",
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.1,
      shadowRadius: 25,
      elevation: 10,
    },
  },
};

export type Shadow = typeof shadow;
