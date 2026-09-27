interface Bucket {
  windowStartMs: number;
  count: number;
}

export function createRateLimiter() {
  const buckets = new Map<string, Bucket>();

  function take(key: string, nowMs: number, limit: number, windowMs: number): boolean {
    const start = nowMs - (nowMs % windowMs);
    const existing = buckets.get(key);
    if (!existing || existing.windowStartMs !== start) {
      buckets.set(key, { windowStartMs: start, count: 1 });
      return true;
    }
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }

  return { take };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
