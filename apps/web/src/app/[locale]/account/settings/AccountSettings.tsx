"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Separator,
} from "@repo/ui/components";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import {
  getLocalizedSignInPath,
  getLocaleFromPathname,
} from "../../../../i18n/paths";
import { useSession } from "../../../../components/auth/SessionProvider";
import { webApi } from "../../../../lib/api";
import { toSessionIdentity } from "../../../../lib/auth-types";

interface AccountSettingsProps {
  initialUser: v1.auth.SessionUser;
  initialSessions: v1.auth.SessionSummary[];
  enabledMethods: readonly v1.auth.AuthMethodId[];
}

interface Feedback {
  kind: "error" | "success";
  title: string;
  message: string;
}

const PROVIDER_LABELS: Record<v1.auth.OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export function AccountSettings({
  initialUser,
  initialSessions,
  enabledMethods,
}: AccountSettingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser: setSessionUser } = useSession();
  const [user, setUser] = useState(initialUser);
  const [sessions, setSessions] = useState(initialSessions);
  const [firstName, setFirstName] = useState(initialUser.firstName ?? "");
  const [lastName, setLastName] = useState(initialUser.lastName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const input = v1.auth.updateProfileInputSchema.safeParse({
      firstName: normalizeProfileName(firstName),
      lastName: normalizeProfileName(lastName),
    });
    if (!input.success) {
      setFeedback({
        kind: "error",
        title: "Profile not saved",
        message: input.error.issues[0]?.message ?? "Check the profile fields.",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await webApi.fetch(
        v1.auth.ROUTES.updateProfile,
        v1.auth.sessionUserSchema,
        {
          method: "PATCH",
          json: input.data,
        },
      );
      setUser(updated);
      setSessionUser(toSessionIdentity(updated));
      setFirstName(updated.firstName ?? "");
      setLastName(updated.lastName ?? "");
      setFeedback({
        kind: "success",
        title: "Profile saved",
        message: "Your name has been updated.",
      });
      router.refresh();
    } catch (error) {
      setFeedback(apiErrorFeedback(error, "Profile not saved"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function revokeSession(sessionId: string): Promise<boolean> {
    setFeedback(null);
    try {
      await webApi.fetch(
        v1.auth.ROUTES.sessions.revoke(sessionId),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      setSessions((current) =>
        current.filter((session) => session.id !== sessionId),
      );
      setFeedback({
        kind: "success",
        title: "Session revoked",
        message: "That device will need to sign in again.",
      });
      return true;
    } catch (error) {
      setFeedback(apiErrorFeedback(error, "Session not revoked"));
      return false;
    }
  }

  async function logoutAll(): Promise<boolean> {
    setFeedback(null);
    try {
      await webApi.fetch(
        v1.auth.ROUTES.logoutAll,
        v1.auth.logoutAllResultSchema,
        { method: "POST" },
      );
      leaveAccount();
      return true;
    } catch (error) {
      setFeedback(apiErrorFeedback(error, "Sessions not revoked"));
      return false;
    }
  }

  async function unlinkProvider(
    provider: v1.auth.OAuthProvider,
  ): Promise<boolean> {
    setFeedback(null);
    try {
      await webApi.fetch(
        v1.auth.ROUTES.accounts.unlink(provider),
        v1.common.noContentSchema,
        { method: "DELETE" },
      );
      setUser((current) => ({
        ...current,
        linkedProviders: current.linkedProviders.filter(
          (linked) => linked !== provider,
        ),
      }));
      setFeedback({
        kind: "success",
        title: `${PROVIDER_LABELS[provider]} unlinked`,
        message: "Existing sessions remain active.",
      });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback(apiErrorFeedback(error, "Provider not unlinked"));
      return false;
    }
  }

  async function deleteAccount(): Promise<boolean> {
    setFeedback(null);
    try {
      await webApi.fetch(v1.auth.ROUTES.deleteMe, v1.common.noContentSchema, {
        method: "DELETE",
      });
      leaveAccount();
      return true;
    } catch (error) {
      setFeedback(apiErrorFeedback(error, "Account not deleted"));
      return false;
    }
  }

  function leaveAccount() {
    setSessionUser(null);
    router.replace(getLocalizedSignInPath(getLocaleFromPathname(pathname)));
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, sign-in methods, and active sessions.
        </p>
      </div>

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <form onSubmit={(event) => void saveProfile(event)}>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your email is tied to sign-in and cannot be changed here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" value={user.email} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                name="firstName"
                autoComplete="given-name"
                maxLength={100}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                name="lastName"
                autoComplete="family-name"
                maxLength={100}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <span className="text-sm font-medium">Roles</span>
              <div className="flex flex-wrap gap-2">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No roles assigned
                  </span>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-4 justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Revoke devices you no longer recognize or use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {sessions.map((session, index) => (
              <div key={session.id}>
                {index > 0 ? <Separator /> : null}
                <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {describeSession(session)}
                      </span>
                      {session.current ? <Badge>Current</Badge> : null}
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {session.userAgent ?? "User agent unavailable"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last used {formatSessionDate(session.lastUsedAt)}
                      {session.ip ? ` · ${session.ip}` : ""}
                    </p>
                  </div>
                  {!session.current ? (
                    <ConfirmationDialog
                      triggerLabel="Revoke"
                      title="Revoke this session?"
                      description="This device will lose refresh access and must sign in again."
                      confirmLabel="Revoke session"
                      onConfirm={() => revokeSession(session.id)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            This also signs out the current browser.
          </span>
          <ConfirmationDialog
            triggerLabel="Sign out all"
            title="Sign out every device?"
            description="All active sessions, including this browser, will be revoked."
            confirmLabel="Sign out all devices"
            onConfirm={logoutAll}
          />
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in methods</CardTitle>
          <CardDescription>
            Unlinking a provider does not revoke existing sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {enabledMethods.includes("emailOtp") ? (
            <SignInMethodRow
              name="Email one-time code"
              detail={user.email}
              status={user.emailVerified ? "Verified" : "Not verified"}
            />
          ) : null}
          {user.linkedProviders.map((provider, index) => {
            const canUnlink = hasFallbackAfterUnlink(
              provider,
              user,
              enabledMethods,
            );
            return (
              <div key={provider}>
                {enabledMethods.includes("emailOtp") || index > 0 ? (
                  <Separator />
                ) : null}
                <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">
                      {PROVIDER_LABELS[provider]}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {canUnlink
                        ? "Linked to this account."
                        : "Add another enabled sign-in method before unlinking."}
                    </p>
                  </div>
                  <ConfirmationDialog
                    triggerLabel="Unlink"
                    title={`Unlink ${PROVIDER_LABELS[provider]}?`}
                    description={`You will no longer be able to sign in with ${PROVIDER_LABELS[provider]}. Existing sessions stay active.`}
                    confirmLabel="Unlink provider"
                    disabled={!canUnlink}
                    onConfirm={() => unlinkProvider(provider)}
                  />
                </div>
              </div>
            );
          })}
          {!enabledMethods.includes("emailOtp") &&
          user.linkedProviders.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No enabled sign-in methods are linked.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently delete your profile, sessions, OTP challenges, and
            linked providers. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <ConfirmationDialog
            triggerLabel="Delete account"
            triggerVariant="destructive"
            title="Delete your account permanently?"
            description="Type DELETE to confirm. Your audit history may be retained without a user identifier."
            confirmLabel="Delete account"
            confirmText="DELETE"
            onConfirm={deleteAccount}
          />
        </CardFooter>
      </Card>
    </div>
  );
}

function SignInMethodRow({
  name,
  detail,
  status,
}: {
  name: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <div className="font-medium">{name}</div>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Badge variant="secondary">{status}</Badge>
    </div>
  );
}

function ConfirmationDialog({
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  confirmText,
  disabled = false,
  onConfirm,
}: {
  triggerLabel: string;
  triggerVariant?: "outline" | "destructive";
  title: string;
  description: string;
  confirmLabel: string;
  confirmText?: string;
  disabled?: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const confirmationId = useId();

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    setOpen(nextOpen);
    if (!nextOpen) setTypedConfirmation("");
  }

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
      setTypedConfirmation("");
    } finally {
      setBusy(false);
    }
  }

  const confirmationMatches =
    confirmText === undefined || typedConfirmation === confirmText;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={triggerVariant}
            size="sm"
            disabled={disabled}
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmText ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={confirmationId}>Confirmation</Label>
            <Input
              id={confirmationId}
              autoComplete="off"
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={busy} />}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !confirmationMatches}
            onClick={() => void confirm()}
          >
            {busy ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeProfileName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasFallbackAfterUnlink(
  provider: v1.auth.OAuthProvider,
  user: v1.auth.SessionUser,
  enabledMethods: readonly v1.auth.AuthMethodId[],
): boolean {
  if (enabledMethods.includes("emailOtp") && user.emailVerified) {
    return true;
  }

  return user.linkedProviders.some(
    (linked) => linked !== provider && enabledMethods.includes(linked),
  );
}

function describeSession(session: v1.auth.SessionSummary): string {
  if (session.current) return "This browser";
  const userAgent = session.userAgent ?? "";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  const platform = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown device";
  return `${browser} on ${platform}`;
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function apiErrorFeedback(error: unknown, title: string): Feedback {
  return {
    kind: "error",
    title,
    message:
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Try again.",
  };
}
