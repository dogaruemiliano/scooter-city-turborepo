import { NextRequest } from "next/server";

const signingCookie = "scooter_signing";
const maximumBodyBytes = 10 * 1024 * 1024;
const safeHeaders = {
  "cache-control": "no-store, private",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

/** Same-origin boundary for the restricted guest session; account cookies never leave this handler. */
async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const route = path.join("/");
  const allowed =
    request.method === "GET"
      ? /^(state|documents\/[A-Za-z0-9_-]+\/file|supporting-files\/[A-Za-z0-9_-]+\/content)$/.test(
          route,
        )
      : /^(session|otp\/(request|verify)|selfie|telemetry|documents\/[A-Za-z0-9_-]+\/(sign|sign-limiter)|complete)$/.test(
          route,
        );
  if (
    !allowed ||
    (request.nextUrl.search &&
      !(
        request.method === "GET" &&
        /^documents\/[A-Za-z0-9_-]+\/file$/.test(route) &&
        ["?variant=presented", "?variant=signed"].includes(
          request.nextUrl.search,
        )
      ))
  )
    return Response.json(
      { message: "Not found" },
      { status: 404, headers: safeHeaders },
    );
  if (
    request.method !== "GET" &&
    (request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers.get("x-requested-with") !== "fetch")
  ) {
    return Response.json(
      { message: "Invalid request origin" },
      { status: 403, headers: safeHeaders },
    );
  }
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL;
  if (!apiOrigin)
    return Response.json(
      { message: "Signing service is not configured" },
      { status: 503, headers: safeHeaders },
    );
  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    if (Number(request.headers.get("content-length")) > maximumBodyBytes)
      return Response.json(
        { message: "File too large" },
        { status: 413, headers: safeHeaders },
      );
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        byteLength += chunk.value.byteLength;
        if (byteLength > maximumBodyBytes) {
          await reader.cancel();
          return Response.json(
            { message: "File too large" },
            { status: 413, headers: safeHeaders },
          );
        }
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = bytes.buffer;
  }
  const headers = new Headers({
    "x-requested-with": "fetch",
    origin: request.nextUrl.origin,
  });
  const cookie = request.cookies.get(signingCookie);
  if (cookie) headers.set("cookie", `${signingCookie}=${cookie.value}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  try {
    const response = await fetch(
      new URL(`/v1/signing/${route}${request.nextUrl.search}`, apiOrigin),
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
      },
    );
    const outgoing = new Headers(safeHeaders);
    for (const key of ["content-type", "content-disposition", "retry-after"]) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith(`${signingCookie}=`))
        outgoing.append("set-cookie", value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { message: "Signing service is temporarily unavailable" },
      { status: 503, headers: safeHeaders },
    );
  }
}

export const GET = forward;
export const POST = forward;
