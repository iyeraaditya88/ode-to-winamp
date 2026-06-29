// Lightweight, dependency-free event log for diagnosing the playback lifecycle
// (SDK ready/drop, foreground recovery, rebuilds, play attempts, activation).
// Entries go to an in-memory ring buffer (rendered by DebugOverlay so it's
// visible on mobile PWA where devtools aren't reachable) and to console.

export interface PlayerLogEntry {
  t: number; // ms since first log
  tag: string;
  msg?: string;
}

const MAX = 400;
const buffer: PlayerLogEntry[] = [];
const subs = new Set<() => void>();
let t0 = 0;

function elapsed(): number {
  if (typeof performance === 'undefined') return 0;
  if (!t0) t0 = performance.now();
  return Math.round(performance.now() - t0);
}

export function plog(tag: string, msg?: string): void {
  const entry: PlayerLogEntry = { t: elapsed(), tag, msg };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log(`[plog +${entry.t}ms] ${tag}${msg ? ' — ' + msg : ''}`);
  }
  subs.forEach((s) => s());
}

export function getPlayerLogs(): PlayerLogEntry[] {
  return buffer;
}

export function clearPlayerLogs(): void {
  buffer.length = 0;
  subs.forEach((s) => s());
}

export function subscribePlayerLogs(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function formatPlayerLogs(): string {
  return buffer.map((e) => `+${e.t}ms\t${e.tag}${e.msg ? '\t' + e.msg : ''}`).join('\n');
}

// Whether to show the on-screen overlay. Default ON while we diagnose the
// playback-after-idle bug; append ?debug=0 to the URL to silence it.
export function isPlayerDebug(): boolean {
  if (typeof window === 'undefined') return false;
  const q = window.location.search;
  if (q.includes('debug=0')) return false;
  if (q.includes('debug=1')) return true;
  try {
    const v = window.localStorage.getItem('otw_debug');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}
