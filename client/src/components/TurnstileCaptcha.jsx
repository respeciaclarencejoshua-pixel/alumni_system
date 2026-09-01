import { useEffect, useRef } from 'react';

const SCRIPT_ID = 'cloudflare-turnstile-script';

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function TurnstileCaptcha({ onToken, resetKey }) {
  const containerRef = useRef(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;
    let active = true; let widgetId;
    loadTurnstile().then(() => {
      if (!active || !containerRef.current) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey, theme: 'light', size: 'flexible',
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => { active = false; if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId); };
  }, [siteKey, resetKey, onToken]);

  if (!siteKey) return <p className="captcha-config-error">CAPTCHA is not configured. Add the Turnstile site key to the client environment.</p>;
  return <div className="captcha-box"><div ref={containerRef} /><small>Protected by Cloudflare Turnstile</small></div>;
}
