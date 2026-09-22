// Shared counters for independent Vercel instances. No persistent TCP connection required.
const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}`;
const decrementScript = `
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if hits > 0 then return redis.call('DECR', KEYS[1]) end
return 0`;

export class RedisRateLimitStore {
  constructor({ url, token, prefix, fetchImpl = fetch }) {
    this.url = url;
    this.token = token;
    this.prefix = prefix;
    this.fetchImpl = fetchImpl;
    this.localKeys = false;
  }

  init({ windowMs }) { this.windowMs = windowMs; }

  async command(args) {
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body.error || !Object.hasOwn(body, 'result')) throw new Error();
      return body.result;
    } catch {
      // Do not log provider response bodies or credentials.
      throw Object.assign(new Error('Shared rate-limit service unavailable.'), {
        status: 503, publicMessage: 'Request protection is temporarily unavailable. Please try again shortly.',
      });
    }
  }

  async increment(key) {
    const result = await this.command(['EVAL', incrementScript, 1, this.prefix + key, this.windowMs]);
    if (!Array.isArray(result) || result.length !== 2 || !Number.isSafeInteger(result[0]) || result[0] < 1 || !Number.isFinite(result[1]) || result[1] < 0) {
      throw Object.assign(new Error('Invalid shared rate-limit response.'), { status: 503 });
    }
    return { totalHits: result[0], resetTime: new Date(Date.now() + result[1]) };
  }

  async decrement(key) { await this.command(['EVAL', decrementScript, 1, this.prefix + key]); }
  async resetKey(key) { await this.command(['DEL', this.prefix + key]); }
}

export function rateLimitStore(namespace, env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return undefined; // Local development uses express-rate-limit's MemoryStore.
  if (!url || !token || !URL.canParse(url) || new URL(url).protocol !== 'https:') {
    throw new Error('Configure both UPSTASH_REDIS_REST_URL (HTTPS) and UPSTASH_REDIS_REST_TOKEN.');
  }
  const deployment = env.RATE_LIMIT_KEY_PREFIX || `alumni:${env.VERCEL_ENV || env.NODE_ENV || 'development'}`;
  return new RedisRateLimitStore({ url, token, prefix: `${deployment}:${namespace}:` });
}
