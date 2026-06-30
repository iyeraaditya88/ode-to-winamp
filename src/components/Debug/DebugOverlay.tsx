'use client';

import { useEffect, useRef, useState } from 'react';
import {
  formatPlayerLogs,
  getPlayerLogs,
  clearPlayerLogs,
  subscribePlayerLogs,
  subscribePlayerDebug,
  isPlayerDebug,
  setPlayerDebug,
} from '@/lib/playerLog';

// On-screen, copyable player-event log. Renders nothing unless debug is on
// (see playerLog.ts for how to toggle). Reacts live when toggled at runtime, so
// it appears/disappears without a reload.
export default function DebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the debug flag (initial + live toggles).
  useEffect(() => {
    setEnabled(isPlayerDebug());
    return subscribePlayerDebug(() => setEnabled(isPlayerDebug()));
  }, []);

  // Re-render as new log lines arrive (only while enabled).
  useEffect(() => {
    if (!enabled) return;
    return subscribePlayerLogs(() => force((n) => n + 1));
  }, [enabled]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  // Always-present, invisible corner zone: triple-tap (within 700ms) toggles the
  // trace on/off — the only enable path that works inside an installed PWA where
  // the URL bar and console aren't reachable.
  const tapTimes = useRef<number[]>([]);
  const cornerTap = () => {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current, now].filter((t) => now - t < 700);
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      setPlayerDebug(!isPlayerDebug());
    }
  };
  const cornerZone = (
    <div
      onClick={cornerTap}
      aria-hidden
      className="fixed bottom-0 right-0 z-[100] h-5 w-5"
      style={{ background: 'transparent' }}
    />
  );

  if (!enabled) return cornerZone;

  const logs = getPlayerLogs();

  const copy = async () => {
    const text = formatPlayerLogs();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — select-all fallback via a transient textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-2 right-2 z-[100] rounded-full bg-black/70 border border-[#00b4b4]/40 text-[#00b4b4] text-[10px] font-mono px-2.5 py-1 backdrop-blur-sm"
      >
        🐞 {logs.length}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-1 bottom-1 z-[100] h-[42vh] rounded-md border border-[#00b4b4]/30 bg-black/90 backdrop-blur-sm flex flex-col text-[#cfe] font-mono text-[10px] leading-snug">
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 shrink-0">
        <span className="text-[#00b4b4]">player log · {logs.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="px-2 py-0.5 rounded border border-[#00b4b4]/40 text-[#00b4b4]">
            {copied ? 'copied' : 'copy'}
          </button>
          <button
            onClick={() => {
              clearPlayerLogs();
              force((n) => n + 1);
            }}
            className="px-2 py-0.5 rounded border border-white/20 text-white/70"
          >
            clear
          </button>
          <button onClick={() => setOpen(false)} className="px-2 py-0.5 rounded border border-white/20 text-white/70">
            hide
          </button>
          <button
            onClick={() => setPlayerDebug(false)}
            className="px-2 py-0.5 rounded border border-red-400/40 text-red-300"
          >
            off
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="overflow-y-auto px-2 py-1 space-y-0.5">
        {logs.map((e, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            <span className="text-white/35">+{e.t}ms</span> <span className="text-[#8ff]">{e.tag}</span>
            {e.msg ? <span className="text-white/80"> {e.msg}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
