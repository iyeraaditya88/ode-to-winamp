'use client';

import { useState, useEffect, useCallback } from 'react';

export type EqTheme = 'winamp' | 'teal' | 'fire' | 'ice' | 'mono' | 'rainbow';
export type EqStyle = 'bars' | 'blocks' | 'mirror';

export interface EqSettings {
  theme: EqTheme;
  style: EqStyle;
  barCount: number;
}

export const EQ_THEMES: { id: EqTheme; label: string; stops: string[] }[] = [
  { id: 'winamp', label: 'Winamp', stops: ['#00b4b4', '#1db954', '#00ff41'] },
  { id: 'teal', label: 'Teal', stops: ['#063b3b', '#00b4b4', '#7df9ff'] },
  { id: 'fire', label: 'Fire', stops: ['#7a0d02', '#ff5e00', '#ffd000'] },
  { id: 'ice', label: 'Ice', stops: ['#0a2a6b', '#1e90ff', '#e0ffff'] },
  { id: 'mono', label: 'Mono', stops: ['#3a3a3a', '#cccccc', '#ffffff'] },
  { id: 'rainbow', label: 'Rainbow', stops: ['rainbow'] },
];

export const EQ_STYLES: { id: EqStyle; label: string }[] = [
  { id: 'bars', label: 'Bars' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'mirror', label: 'Mirror' },
];

const DEFAULT: EqSettings = { theme: 'winamp', style: 'blocks', barCount: 32 };
const KEY = 'otw_eq_settings';

export function useEqualizerSettings() {
  const [settings, setSettings] = useState<EqSettings>(DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((patch: Partial<EqSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
