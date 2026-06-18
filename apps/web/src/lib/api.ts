import { createApiClient } from "@repo/api-shared";

export const webApi = (() => {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!configuredApiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required and must point to the public NestJS API origin.",
    );
  }

  try {
    return createApiClient(configuredApiUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid URL";
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: ${reason}`);
  }
})();
