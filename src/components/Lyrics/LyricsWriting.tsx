'use client';

// Lyrics-loading flourish: a pen sweeps line-by-line while each line's ink
// reveals left-to-right over a faint ghost of the words — as if the lyrics are
// being hand-written while we fetch them. Pure CSS (see globals.css) so it's
// cheap and keeps animating regardless of React render timing.

// Abstract pseudo-lyric syllables — meant to read as faint, half-formed words
// being written, NOT as a legible message. A light blur keeps them suggestive
// but not quite readable.
const GHOST_LINES = [
  'ne sara la mio canti',
  'velada sonu mara te lae',
  'illa noche verda sol',
  'amaru kanle si do re',
];

const ROW_H = 26; // px — must match the lyric-pen keyframe top steps in globals.css

export default function LyricsWriting({ className = '' }: { className?: string }) {
  return (
    <div className={className} aria-label="Loading lyrics" role="status">
      <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.25em] text-[#00b4b4]/70">
        writing the lyrics
        <span className="lyric-dots" />
      </p>

      <div className="relative" style={{ height: GHOST_LINES.length * ROW_H + 6 }}>
        {GHOST_LINES.map((line, i) => (
          <div
            key={i}
            className="relative font-serif text-base italic sm:text-lg"
            // Soft blur → the strokes read as words without being legible.
            style={{ height: ROW_H, lineHeight: `${ROW_H}px`, filter: 'blur(0.7px)' }}
          >
            {/* faint ghost — always visible, so there's text even between strokes */}
            <span className="select-none text-white/[0.07]">{line}</span>
            {/* bright ink that writes over the ghost left-to-right */}
            <span
              className="lyric-ink absolute inset-0 select-none text-[#00b4b4]/80"
              // i × (18% of the 12s cycle) keeps each line's reveal in step with
              // the pen sweeping that line.
              style={{ animationDelay: `${i * 2.16}s` }}
            >
              {line}
            </span>
          </div>
        ))}

        {/* the pen — its nib rides the writing edge */}
        <div className="lyric-pen absolute" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: 'translate(-3px, -2px)' }}>
            <path
              d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32L19.513 8.2z"
              fill="#00b4b4"
            />
            {/* nib highlight */}
            <circle cx="3.2" cy="20.8" r="1" fill="#eafffd" />
          </svg>
        </div>
      </div>
    </div>
  );
}
