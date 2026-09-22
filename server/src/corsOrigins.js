function normalizeOrigin(value) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function configuredOrigins(env = process.env) {
  const values = (env.CLIENT_ORIGIN || '').split(',');
  if (env.VERCEL === '1') {
    // Trust deployment configuration, never request Host / Forwarded headers.
    for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
      if (env[key]) values.push(`https://${env[key]}`);
    }
  }
  if (env.NODE_ENV !== 'production' && env.VERCEL !== '1') values.push('http://localhost:5173');
  return new Set(values.map(normalizeOrigin).filter(Boolean));
}
