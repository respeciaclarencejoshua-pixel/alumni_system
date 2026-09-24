import { useLayoutEffect } from 'react';

export function useMessageInputSize(ref, value, context) {
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      input.style.height = '44px';
      const height = Math.max(44, Math.min(input.scrollHeight, 120));
      input.style.height = `${height}px`;
      input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden';
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) { width = input.clientWidth; resize(); }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [ref, value, context]);
}
