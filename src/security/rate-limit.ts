const buckets = new Map<string, { count: number; resetAt: number }>();

// Keys derived from client-controlled values (forwarded IPs) are unbounded, so
// expired buckets are swept once the map grows past a plausible working set.
const SWEEP_THRESHOLD = 1_000;

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > SWEEP_THRESHOLD) sweepExpired(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

// Returns a response only when the caller must stop. The body is constant so a
// rejection never reveals whether the key, seller, or resource exists.
export function enforceRateLimit(key: string, limit: number, windowMs?: number) {
  if (checkRateLimit(key, limit, windowMs)) return undefined;
  return new Response("Rate limited", { status: 429 });
}

export function resetRateLimits(): void {
  buckets.clear();
}
