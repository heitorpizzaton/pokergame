import { useSyncExternalStore } from 'react';

const query = '(orientation: landscape) and (min-aspect-ratio: 5/4)';

function subscribe(onChange: () => void): () => void {
  const list = globalThis.matchMedia(query);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

/** Portrait on phones (primary layout), landscape on wide screens (AGENTS.md §11.2). */
export function useOrientation(): 'portrait' | 'landscape' {
  return useSyncExternalStore(
    subscribe,
    () => (globalThis.matchMedia(query).matches ? 'landscape' : 'portrait'),
    () => 'portrait',
  );
}
