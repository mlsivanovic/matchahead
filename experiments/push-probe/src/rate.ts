export interface RateBucket {
  windowStartMs: number;
  count: number;
}

export function nextRateBucket(
  existing: RateBucket | undefined,
  nowMs: number,
  limit: number,
  windowMs: number,
): { allow: boolean; bucket: RateBucket } {
  const windowStartMs = nowMs - (nowMs % windowMs);
  if (!existing || existing.windowStartMs !== windowStartMs) {
    return { allow: true, bucket: { windowStartMs, count: 1 } };
  }
  if (existing.count >= limit) return { allow: false, bucket: existing };
  return { allow: true, bucket: { windowStartMs, count: existing.count + 1 } };
}

export function createRateLimiter() {
  const buckets = new Map<string, RateBucket>();

  function take(key: string, nowMs: number, limit: number, windowMs: number): boolean {
    const decision = nextRateBucket(buckets.get(key), nowMs, limit, windowMs);
    if (decision.allow) buckets.set(key, decision.bucket);
    return decision.allow;
  }

  return { take };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
