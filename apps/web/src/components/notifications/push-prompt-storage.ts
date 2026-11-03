const KEY_PREFIX = "scooter-notifications-prompt:v1:";
const storageFallback = new Map<string, PushPromptDecision>();

type PushPromptDecision =
  | "shown"
  | "dismissed"
  | "enabled"
  | "denied"
  | "permission-dismissed"
  | "failed";

export function pushPromptStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function hasSeenPushPrompt(userId: string): boolean {
  try {
    return (
      localStorage.getItem(pushPromptStorageKey(userId)) !== null ||
      storageFallback.has(userId)
    );
  } catch {
    return storageFallback.has(userId);
  }
}

export function rememberPushPrompt(
  userId: string,
  decision: PushPromptDecision,
): void {
  try {
    localStorage.setItem(pushPromptStorageKey(userId), decision);
  } catch {
    // Respect the choice for this page session when persistent storage is blocked.
    storageFallback.set(userId, decision);
  }
}
