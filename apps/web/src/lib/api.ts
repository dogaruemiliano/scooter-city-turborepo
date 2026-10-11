import {
  ApiError,
  createApiClient,
  type ApiClient,
  v1,
} from "@repo/api-shared";

export const webApi = (() => {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!configuredApiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required and must point to the public NestJS API origin.",
    );
  }

  try {
    const client = createApiClient(configuredApiUrl);
    const fetch: ApiClient["fetch"] = async (path, schema, options) => {
      try {
        return await client.fetch(path, schema, options);
      } catch (error) {
        if (
          typeof window !== "undefined" &&
          path !== v1.auth.ROUTES.me &&
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          window.dispatchEvent(new Event("access-changed"));
        }
        throw error;
      }
    };
    return { ...client, fetch };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid URL";
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: ${reason}`);
  }
})();
