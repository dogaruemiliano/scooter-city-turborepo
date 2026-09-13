import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const HISTORY_MARKER = "personCreateLeaveGuard";

/** Protect in-memory progress; nothing from the form is persisted. */
export function usePersonLeaveGuard(hasProgress: boolean, message: string) {
  const router = useRouter();
  const completed = useRef(false);

  useEffect(() => {
    // Retire drafts saved by previous versions, including their stored Files.
    try {
      if (typeof indexedDB !== "undefined")
        indexedDB.deleteDatabase("person-create-drafts");
    } catch {
      // Storage can be disabled; it must not prevent using the in-memory form.
    }
  }, []);

  useEffect(() => {
    if (!hasProgress) return;
    const formUrl = window.location.href;
    // A duplicate entry lets us handle browser Back before Next unmounts the form.
    // Preserve Next's own history state and avoid duplicates in Strict Mode.
    if (!window.history.state?.[HISTORY_MARKER]) {
      window.history.pushState(
        { ...window.history.state, [HISTORY_MARKER]: true },
        "",
        formUrl,
      );
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (completed.current) return;
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
      if (!window.confirm(message)) return;
      completed.current = true;
      // Replace our guard entry so a confirmed link does not add an extra Back step.
      if (destination.origin === current.origin)
        router.replace(
          destination.pathname + destination.search + destination.hash,
        );
      else window.location.replace(destination.href);
    };

    const onPopState = (event: PopStateEvent) => {
      if (completed.current) return;
      event.stopImmediatePropagation();
      if (event.state?.[HISTORY_MARKER]) return; // Return after cancelling Back.
      if (window.confirm(message)) {
        completed.current = true;
        window.history.back();
      } else window.history.forward();
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [hasProgress, message, router]);

  return {
    complete: () => {
      completed.current = true;
    },
  };
}
