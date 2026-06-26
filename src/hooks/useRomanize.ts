'use client';

import { useCallback, useEffect, useState } from 'react';

// Lazy-loaded so the (sizable) transliteration charmap only ships when used.
let txFn: ((s: string) => string) | null = null;
let loading: Promise<void> | null = null;
function loadLib(): Promise<void> {
  if (txFn) return Promise.resolve();
  if (!loading) {
    loading = import('transliteration').then((m) => {
      txFn = m.transliterate;
    });
  }
  return loading;
}

const KEY = 'otw_romanize';

/**
 * Romanize (transliterate) non-Latin lyrics into Latin letters so they can be
 * read/sung phonetically. `tx(text)` returns the original until enabled + the
 * library has loaded, then the romanized form.
 */
export function useRomanize() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(() => !!txFn);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (enabled && !txFn) loadLib().then(() => setReady(true));
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const tx = useCallback(
    (text: string) => (enabled && txFn ? txFn(text) : text),
    // `ready` re-binds tx once the lib finishes loading.
    [enabled, ready]
  );

  return { enabled, toggle, tx };
}
