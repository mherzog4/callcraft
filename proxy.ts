import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    "x-request-id",
    request.headers.get("x-request-id")?.slice(0, 128) ?? crypto.randomUUID(),
  );
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  const scripts =
    process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
  response.headers.set(
    "content-security-policy",
    `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scripts}; connect-src 'self' https://slack.com https://oauth2.googleapis.com https://openrouter.ai`,
  );
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
