// Toggleable, zero-cost-when-off event log for the playback lifecycle (SDK
// ready/drop, foreground recovery, rebuilds, play attempts, activation).
//
// OFF by default. Turn it on any of these ways — it persists across reloads:
//   • append ?debug=1 to the URL (?debug=0 to force off)
//   • call playerDebug() in the browser console  (playerDebug(false) to stop)
//   • tap the 🐞 chip's "off" once the overlay is showing
// When off, plog() returns immediately: no buffer growth, no console output,
// and DebugOverlay renders nothing.

export interface PlayerLogEntry {
  t: number; // ms since first recorded log
  tag: string;
  msg?: string;
}

const MAX = 400;
const buffer: PlayerLogEntry[] = [];
const logSubs = new Set<() => void>();
const enabledSubs = new Set<() => void>();
let t0 = 0;
let enabled = false;

function readInitialEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('debug') === '1') return true;
    if (q.get('debug') === '0') return false;
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage.getItem('otw_debug') === '1';
  } catch {
    return false;
  }
}

function elapsed(): number {
  if (typeof performance === 'undefined') return 0;
  if (!t0) t0 = performance.now();
  return Math.round(performance.now() - t0);
}

export function plog(tag: string, msg?: string): void {
  if (!enabled) return; // zero cost when disabled
  const entry: PlayerLogEntry = { t: elapsed(), tag, msg };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  // eslint-disable-next-line no-console
  console.log(`[plog +${entry.t}ms] ${tag}${msg ? ' — ' + msg : ''}`);
  logSubs.forEach((s) => s());
}

export function isPlayerDebug(): boolean {
  return enabled;
}

export function setPlayerDebug(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem('otw_debug', on ? '1' : '0');
  } catch {
    /* ignore */
  }
  enabledSubs.forEach((s) => s());
}

export function subscribePlayerDebug(fn: () => void): () => void {
  enabledSubs.add(fn);
  return () => {
    enabledSubs.delete(fn);
  };
}

export function subscribePlayerLogs(fn: () => void): () => void {
  logSubs.add(fn);
  return () => {
    logSubs.delete(fn);
  };
}

export function getPlayerLogs(): PlayerLogEntry[] {
  return buffer;
}

export function clearPlayerLogs(): void {
  buffer.length = 0;
  logSubs.forEach((s) => s());
}

export function formatPlayerLogs(): string {
  return buffer.map((e) => `+${e.t}ms\t${e.tag}${e.msg ? '\t' + e.msg : ''}`).join('\n');
}

// Initialise once on the client + expose a console toggle for convenience.
if (typeof window !== 'undefined') {
  enabled = readInitialEnabled();
  (window as unknown as { playerDebug?: (on?: boolean) => void }).playerDebug = (on = true) =>
    setPlayerDebug(on);
}
