import { setTimeout as sleep } from "node:timers/promises";
import { GongError } from "./contract";

const nextAllowedByTenant = new Map<string, number>();

function retryAfterMilliseconds(value: string | null): number {
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 1000 : Math.max(1000, date - Date.now());
}

export class GongHttpClient {
  constructor(
    private readonly config: {
      baseUrl: string;
      accessKey: string;
      accessSecret: string;
      fetch?: typeof fetch;
    },
  ) {}

  async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; requestId: string | null }> {
    const key = new URL(this.config.baseUrl).origin;
    const wait = Math.max(0, (nextAllowedByTenant.get(key) ?? 0) - Date.now());
    if (wait) await sleep(wait);
    nextAllowedByTenant.set(key, Date.now() + 334);
    const response = await (this.config.fetch ?? fetch)(new URL(path, this.config.baseUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.config.accessKey}:${this.config.accessSecret}`).toString("base64")}`,
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
    const requestId = response.headers.get("x-request-id");
    if (response.status === 429) {
      throw new GongError(
        "Gong rate limit exceeded",
        "rate_limit",
        retryAfterMilliseconds(response.headers.get("retry-after")),
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new GongError("Gong credentials or scopes were rejected", "auth");
    if (response.status === 404)
      throw new GongError("Gong resource is not available yet", "not_found", 30_000);
    if (!response.ok)
      throw new GongError(
        `Gong returned HTTP ${response.status}`,
        "provider",
        response.status >= 500 ? 5000 : undefined,
      );
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new GongError("Gong returned invalid JSON", "invalid_response");
    }
    return { data, requestId };
  }
}
