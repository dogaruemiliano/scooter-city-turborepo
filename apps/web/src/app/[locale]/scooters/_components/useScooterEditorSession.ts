"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { webApi } from "@/lib/api";

export function isScooterEditorSessionUnavailable(error: unknown) {
  return (
    error instanceof ApiError &&
    error.code === "DOCUMENT_EDITOR_SESSION_UNAVAILABLE"
  );
}

function unavailableSession() {
  return new ApiError(
    410,
    "The document editor session is closed or expired.",
    "DOCUMENT_EDITOR_SESSION_UNAVAILABLE",
  );
}

/** Owns uploads/jobs even when an editor never produces a saved scooter. */
export function useScooterEditorSession() {
  const session = useRef<v1.scooters.ScooterDocumentEditorSession | null>(null);
  const pending = useRef<Promise<string> | null>(null);
  const lifecycle = useRef<"open" | "saving" | "saved" | "discarded">("open");
  const mounted = useRef(true);
  const unavailable = useRef(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const handleSessionError = useCallback((error: unknown) => {
    if (!isScooterEditorSessionUnavailable(error)) return false;
    unavailable.current = true;
    if (mounted.current) setSessionUnavailable(true);
    return true;
  }, []);

  const discardSession = useCallback(() => {
    if (lifecycle.current !== "open") return;
    lifecycle.current = "discarded";
    if (!session.current) return;
    // A separate keepalive request may finish after the editor's own requests abort.
    void webApi
      .fetch(
        v1.scooters.ROUTES.documents.discardEditorSession(session.current.id),
        v1.scooters.discardScooterDocumentEditorSessionSchema,
        { method: "POST", keepalive: true },
      )
      .catch(() => undefined); // Server expiry handles lost tab-close requests.
  }, []);

  const ensureSession = useCallback(async () => {
    if (lifecycle.current === "discarded" || lifecycle.current === "saved")
      throw new Error("This document editor session is closed");
    if (
      unavailable.current ||
      (session.current && Date.parse(session.current.expiresAt) <= Date.now())
    ) {
      const error = unavailableSession();
      handleSessionError(error);
      throw error;
    }
    if (session.current) return session.current.id;
    if (pending.current) return pending.current;
    pending.current = webApi
      .fetch(
        v1.scooters.ROUTES.documents.createEditorSession,
        v1.scooters.scooterDocumentEditorSessionSchema,
        { method: "POST" },
      )
      .then((created) => {
        session.current = created;
        if (lifecycle.current === "discarded") {
          // The user left while the session-creation response was in flight.
          lifecycle.current = "open";
          discardSession();
          throw new Error("This document editor session was discarded");
        }
        return created.id;
      })
      .catch((error: unknown) => {
        handleSessionError(error);
        throw error;
      })
      .finally(() => {
        pending.current = null;
      });
    return pending.current;
  }, [discardSession, handleSessionError]);

  useEffect(() => {
    mounted.current = true;
    const onPageHide = (event: PageTransitionEvent) => {
      // A page in the back/forward cache is suspended, not abandoned.
      if (!event.persisted) discardSession();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", onPageHide);
      // React's development effect probe remounts before this microtask.
      queueMicrotask(() => {
        if (!mounted.current) discardSession();
      });
    };
  }, [discardSession]);

  return {
    ensureSession,
    sessionUnavailable,
    handleSessionError,
    discardSession,
    beginSave: () => {
      if (lifecycle.current === "open") lifecycle.current = "saving";
    },
    saved: () => {
      lifecycle.current = "saved";
    },
    saveFailed: () => {
      if (lifecycle.current !== "saving") return;
      lifecycle.current = "open";
      if (!mounted.current) discardSession();
    },
  };
}
