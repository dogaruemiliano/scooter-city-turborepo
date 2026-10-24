import { v1 } from "@repo/api-shared";
import { webApi } from "./api";

export function userAvatarSrc(assetId?: string | null): string | undefined {
  return assetId
    ? webApi.url(v1.auth.ROUTES.avatarContent(assetId))
    : undefined;
}
