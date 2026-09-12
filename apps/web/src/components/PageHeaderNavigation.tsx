"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

export type PageHeaderNavigationOptions = {
  onBack?: () => void;
  backDisabled?: boolean;
  forwardAction?: {
    onClick: () => void;
    label: string;
    disabled?: boolean;
  };
};

export const PageHeaderNavigationContext = createContext<
  ((options: PageHeaderNavigationOptions) => () => void) | null
>(null);

/** Registers page-specific controls in the mobile app header. */
export function PageHeaderNavigation({
  onBack,
  backDisabled = false,
  forwardAction,
}: PageHeaderNavigationOptions) {
  const register = useContext(PageHeaderNavigationContext);
  const onForward = forwardAction?.onClick;
  const callbacks = useRef({ onBack, onForward });

  // Callbacks may close over changing form state without changing the header.
  useLayoutEffect(() => {
    callbacks.current = { onBack, onForward };
  }, [onBack, onForward]);

  const hasBack = Boolean(onBack);
  const hasForward = Boolean(forwardAction);
  const forwardLabel = forwardAction?.label ?? "";
  const forwardDisabled = forwardAction?.disabled ?? false;

  useEffect(() => {
    if (!register) {
      return;
    }

    return register({
      onBack: hasBack ? () => callbacks.current.onBack?.() : undefined,
      backDisabled,
      forwardAction: hasForward
        ? {
            onClick: () => callbacks.current.onForward?.(),
            label: forwardLabel,
            disabled: forwardDisabled,
          }
        : undefined,
    });
  }, [
    register,
    hasBack,
    backDisabled,
    hasForward,
    forwardLabel,
    forwardDisabled,
  ]);

  return null;
}
