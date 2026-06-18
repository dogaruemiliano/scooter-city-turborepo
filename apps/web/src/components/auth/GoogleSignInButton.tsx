"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/**
 * Google Identity Services button. Loads the GIS client (~5KB), renders
 * Google's official button into a div, and passes the returned ID token
 * to the sign-in coordinator. Provider tokens remain in React memory.
 *
 * Requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to match the API's
 * `GOOGLE_CLIENT_ID_WEB` (the API verifies the audience against that).
 */
interface GisCredentialResponse {
  credential: string;
}

interface GisIdInit {
  client_id: string;
  callback: (response: GisCredentialResponse) => void;
  ux_mode?: "popup" | "redirect";
}

interface GisButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface GisIdApi {
  initialize: (opts: GisIdInit) => void;
  renderButton: (parent: HTMLElement, opts: GisButtonOptions) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GisIdApi } };
  }
}

export interface GoogleSignInButtonProps {
  clientId: string;
  onCredential: (idToken: string) => Promise<void>;
  onError: () => void;
}

export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scriptReady || !buttonRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setBusy(true);
        try {
          await onCredential(response.credential);
        } catch {
          onError();
        } finally {
          setBusy(false);
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
    });
  }, [clientId, onCredential, onError, scriptReady]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={onError}
      />
      <div
        ref={buttonRef}
        aria-busy={busy}
        className={busy ? "pointer-events-none opacity-50" : undefined}
      />
    </>
  );
}
