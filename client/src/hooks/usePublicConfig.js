import { useEffect, useState } from 'react';

export function useCaptchaEnabled() {
  // Fail closed until the public configuration has loaded.
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/config')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((config) => { if (active) setEnabled(config.captchaEnabled !== false); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return enabled;
}
