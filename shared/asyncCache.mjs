// Bounded, per-process cache. Concurrent misses share one loader; errors are not cached.
export function createAsyncCache({ ttlMs, maxEntries = 100, now = Date.now }) {
  const entries = new Map();
  return {
    get(key, loader) {
      const existing = entries.get(key);
      if (existing && (existing.pending || existing.expiresAt > now())) return existing.promise;
      if (existing) entries.delete(key);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const entry = { pending: true, expiresAt: 0, promise: null };
      entry.promise = Promise.resolve().then(loader).then(value => {
        entry.pending = false;
        entry.expiresAt = now() + ttlMs;
        return value;
      }, error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      return entry.promise;
    },
    clear() { entries.clear(); },
  };
}
