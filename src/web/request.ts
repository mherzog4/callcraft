import { NextResponse } from "next/server";
import { getEnv } from "@/src/env";

export function requireSameOrigin(request: Request): NextResponse | null {
  const expected = new URL(getEnv().APP_URL).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected)
    return NextResponse.json({ error: "Missing or invalid Origin" }, { status: 403 });
  return null;
}
export function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}
