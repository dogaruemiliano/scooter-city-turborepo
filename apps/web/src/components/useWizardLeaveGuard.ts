"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const HISTORY_MARKER = "wizardLeaveGuard";
type LeaveAction = () => void;

/** Route protection shared by wizard flows. Owners decide when work needs protection. */
export function useWizardLeaveGuard(enabled: boolean) {
  const router = useRouter();
  const completed = useRef(false);
  const pending = useRef<LeaveAction | null>(null);
  const [open, setOpen] = useState(false);

  function requestLeave(action: LeaveAction) {
    if (!enabled || completed.current) {
      action();
      return;
    }
    pending.current = action;
    setOpen(true);
  }

  function cancel() {
    pending.current = null;
    setOpen(false);
  }

  function leave(beforeLeave?: () => boolean) {
    if (!pending.current || beforeLeave?.() === false) return;
    const action = pending.current;
    pending.current = null;
    completed.current = true;
    setOpen(false);
    action();
  }

  useEffect(() => {
    if (!enabled) return;
    const formUrl = window.location.href;
    const guardState = { ...window.history.state, [HISTORY_MARKER]: formUrl };
    if (window.history.state?.[HISTORY_MARKER] !== formUrl)
      window.history.pushState(guardState, "", formUrl);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (completed.current) return;
      // Browsers require their native confirmation for refresh/tab close.
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (
        completed.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const destination = new URL(link.href, formUrl);
      const current = new URL(formUrl);
      if (
        !/^https?:$/.test(destination.protocol) ||
        (destination.origin === current.origin &&
          destination.pathname === current.pathname &&
          destination.search === current.search)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pending.current = () => {
        if (destination.origin === current.origin)
          router.replace(
            destination.pathname + destination.search + destination.hash,
          );
        else window.location.replace(destination.href);
      };
      setOpen(true);
    };
    const onPopState = (event: PopStateEvent) => {
      if (completed.current) return;
      event.stopImmediatePropagation();
      if (event.state?.[HISTORY_MARKER] === formUrl) return;
      // Restore the guarded URL synchronously, before Next handles this event.
      // Re-arm the same sentinel, so cancelling never creates extra Back steps.
      window.history.pushState(guardState, "", formUrl);
      pending.current = () => window.history.go(-2);
      setOpen(true);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [enabled, router]);

  return {
    open,
    requestLeave,
    cancel,
    leave,
    complete: () => {
      completed.current = true;
    },
  };
}
