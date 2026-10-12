import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the reader has asked for less movement. Anything that moves on its
 * own has to check this: an animation that runs regardless is the one thing a
 * reduced-motion preference exists to stop.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const listen = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', listen);
    return () => media.removeEventListener('change', listen);
  }, []);

  return reduced;
}
