export interface LrcLine {
  time: number;
  text: string;
}

export function parseLrc(lrc: string): LrcLine[] {
  return lrc
    .split('\n')
    .map((line) => {
      const match = line.match(/^\[(\d+):(\d+\.\d+)\](.*)/);
      if (!match) return null;
      const [, min, sec, text] = match;
      return {
        time: (parseInt(min, 10) * 60 + parseFloat(sec)) * 1000,
        text: text.trim(),
      };
    })
    .filter((line): line is LrcLine => line !== null);
}

export function findCurrentLine(lines: LrcLine[], positionMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= positionMs) idx = i;
    else break;
  }
  return idx;
}
