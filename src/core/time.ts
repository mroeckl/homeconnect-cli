export function nowIso(): string {
  return new Date().toISOString();
}

export function isFresh(timestamp: string | undefined, ttlMs: number): boolean {
  if (!timestamp) {
    return false;
  }
  return Date.now() - new Date(timestamp).getTime() <= ttlMs;
}
