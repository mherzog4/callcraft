import { randomUUID } from "node:crypto";

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
}
