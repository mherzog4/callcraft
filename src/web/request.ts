import { NextResponse } from "next/server";
import { getEnv } from "@/src/env";

function parseUrl(value: string, base?: string): URL {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch (error) {
    throw new Error("Configured or request URL is invalid", { cause: error });
  }
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const expected = parseUrl(getEnv().APP_URL).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected)
    return NextResponse.json({ error: "Missing or invalid Origin" }, { status: 403 });
  return null;
}
export function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(parseUrl(path, request.url), 303);
}
