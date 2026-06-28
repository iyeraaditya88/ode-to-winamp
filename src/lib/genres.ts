// Genre taxonomy + mapping for the "Music Taste" radar.
//
// Last.fm tags are crowd-sourced and noisy ("seen live", "00s", "favourites",
// "british", plus thousands of micro-genres). We fold them into a small set of
// macro families via ordered keyword rules, weighted by how much the user likes
// each artist. Pure + dependency-free so it's easy to test and reason about.

export interface MacroGenre {
  id: string;
  label: string;
}

/** The radar axes — a comprehensive-but-legible spectrum of macro genres. */
export const MACRO_GENRES: MacroGenre[] = [
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'rnb', label: 'R&B / Soul' },
  { id: 'indie', label: 'Indie / Alt' },
  { id: 'metal', label: 'Metal' },
  { id: 'folk', label: 'Folk' },
  { id: 'jazz', label: 'Jazz / Blues' },
  { id: 'classical', label: 'Classical' },
  { id: 'country', label: 'Country' },
  { id: 'latin', label: 'Latin / World' },
];

// Ordered [substring, macroId] — FIRST match wins, so more decisive / compound
// terms come before generic ones (e.g. "indie rock" → indie, "electropop" → pop
// before generic "electro" → electronic).
const RULES: [string, string][] = [
  // Metal
  ['metalcore', 'metal'], ['deathcore', 'metal'], ['death metal', 'metal'], ['black metal', 'metal'],
  ['thrash', 'metal'], ['djent', 'metal'], ['grindcore', 'metal'], ['metal', 'metal'],
  // Hip-hop
  ['hip hop', 'hiphop'], ['hip-hop', 'hiphop'], ['hiphop', 'hiphop'], ['rap', 'hiphop'],
  ['trap', 'hiphop'], ['drill', 'hiphop'], ['grime', 'hiphop'], ['boom bap', 'hiphop'],
  // Compound pop (before electronic / generic so they don't get mis-bucketed)
  ['synthpop', 'pop'], ['synth pop', 'pop'], ['electropop', 'pop'], ['electro pop', 'pop'],
  ['dance pop', 'pop'], ['dance-pop', 'pop'], ['art pop', 'pop'], ['power pop', 'pop'], ['hyperpop', 'pop'],
  // Indie / alternative (before rock/pop so "indie rock"/"indie pop" land here)
  ['indie', 'indie'], ['shoegaze', 'indie'], ['dream pop', 'indie'], ['lo-fi', 'indie'],
  ['lofi', 'indie'], ['bedroom', 'indie'], ['alternative', 'indie'], ['alt-', 'indie'],
  // Punk / emo / grunge → rock
  ['pop punk', 'rock'], ['punk', 'rock'], ['emo', 'rock'], ['grunge', 'rock'], ['hardcore', 'rock'],
  // R&B / soul
  ['r&b', 'rnb'], ['rnb', 'rnb'], ['neo soul', 'rnb'], ['neo-soul', 'rnb'], ['soul', 'rnb'],
  ['funk', 'rnb'], ['motown', 'rnb'], ['disco', 'rnb'],
  // Latin / world
  ['reggaeton', 'latin'], ['reggae', 'latin'], ['dancehall', 'latin'], ['salsa', 'latin'],
  ['bachata', 'latin'], ['cumbia', 'latin'], ['k-pop', 'latin'], ['kpop', 'latin'], ['j-pop', 'latin'],
  ['afrobeat', 'latin'], ['afrobeats', 'latin'], ['afro', 'latin'], ['bollywood', 'latin'],
  ['desi', 'latin'], ['punjabi', 'latin'], ['bhangra', 'latin'], ['arabic', 'latin'],
  ['flamenco', 'latin'], ['latin', 'latin'], ['world', 'latin'], ['celtic', 'latin'],
  // Electronic
  ['house', 'electronic'], ['techno', 'electronic'], ['trance', 'electronic'], ['dubstep', 'electronic'],
  ['drum and bass', 'electronic'], ['drum & bass', 'electronic'], ['dnb', 'electronic'], ['edm', 'electronic'],
  ['electro', 'electronic'], ['synthwave', 'electronic'], ['idm', 'electronic'], ['ambient', 'electronic'],
  ['big room', 'electronic'], ['electronica', 'electronic'], ['electronic', 'electronic'], ['downtempo', 'electronic'],
  // Jazz / blues
  ['jazz', 'jazz'], ['blues', 'jazz'], ['swing', 'jazz'], ['bebop', 'jazz'], ['bossa', 'jazz'],
  // Classical
  ['classical', 'classical'], ['orchestra', 'classical'], ['orchestral', 'classical'], ['opera', 'classical'],
  ['baroque', 'classical'], ['symphony', 'classical'], ['piano', 'classical'], ['soundtrack', 'classical'], ['score', 'classical'],
  // Country
  ['country', 'country'], ['americana', 'country'], ['bluegrass', 'country'], ['honky', 'country'],
  // Folk / acoustic
  ['folk', 'folk'], ['acoustic', 'folk'], ['singer-songwriter', 'folk'], ['singer songwriter', 'folk'],
  // Generic rock (after the specific rock-ish terms)
  ['classic rock', 'rock'], ['hard rock', 'rock'], ['psychedelic', 'rock'], ['garage', 'rock'], ['rock', 'rock'],
  // Generic pop / dance last
  ['pop', 'pop'], ['dance', 'electronic'],
];

// Tags that are not genres — drop them entirely.
const NOISE = new Set([
  'seen live', 'favorites', 'favourites', 'favorite', 'favourite', 'spotify', 'all', 'awesome',
  'beautiful', 'love', 'love at first listen', 'cool', 'good music', 'my music', 'music', 'amazing',
  'best', 'chill', 'mellow', 'happy', 'sad', 'party', 'summer', 'female vocalists', 'male vocalists',
  'female vocalist', 'male vocalist', 'instrumental', 'catchy', 'fun', 'sexy', 'epic', 'relax',
  'relaxing', 'british', 'american', 'usa', 'uk', 'canadian', 'australian', 'german', 'french',
  'english', 'irish', 'covers', 'live', 'remix', 'singer', 'songwriter', 'vocal', 'guitar',
]);

const isNoise = (tag: string) => NOISE.has(tag) || /^\s*(19|20)\d0\s*s?\s*$/.test(tag) || /^\d0s$/.test(tag);

/** Map a single raw tag to a macro-genre id, or null if it isn't a usable genre. */
export function tagToMacro(raw: string): string | null {
  const tag = raw.trim().toLowerCase();
  if (!tag || isNoise(tag)) return null;
  for (const [needle, macro] of RULES) {
    if (tag.includes(needle)) return macro;
  }
  return null;
}

export interface ArtistTags {
  name: string;
  weight: number; // how many liked tracks by this artist
  tags: { tag: string; weight: number }[]; // Last.fm tag + count (0-100)
}

export interface GenreSlice {
  id: string;
  label: string;
  pct: number; // 0-100, share of the user's taste
  score: number;
}

export interface TasteProfile {
  slices: GenreSlice[]; // one per MACRO_GENRES axis, same order
  ranked: GenreSlice[]; // non-zero macros, sorted desc
  notable: string[]; // top distinctive sub-genres (raw tags), title-cased
  archetype: string; // headline label
}

const titleCase = (s: string) => s.replace(/\w[^\s-]*/g, (w) => w[0].toUpperCase() + w.slice(1));

/** Fold per-artist Last.fm tags into a normalised macro-genre distribution. */
export function aggregate(artists: ArtistTags[]): TasteProfile {
  const macroScore = new Map<string, number>();
  const rawScore = new Map<string, number>();

  for (const a of artists) {
    for (const { tag, weight } of a.tags) {
      const macro = tagToMacro(tag);
      if (!macro) continue;
      const score = a.weight * (weight || 1);
      macroScore.set(macro, (macroScore.get(macro) ?? 0) + score);
      const key = tag.trim().toLowerCase();
      rawScore.set(key, (rawScore.get(key) ?? 0) + score);
    }
  }

  const total = Array.from(macroScore.values()).reduce((s, v) => s + v, 0) || 1;

  const slices: GenreSlice[] = MACRO_GENRES.map((g) => {
    const score = macroScore.get(g.id) ?? 0;
    return { id: g.id, label: g.label, score, pct: Math.round((score / total) * 100) };
  });

  const ranked = slices.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  const notable = Array.from(rawScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => titleCase(tag))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 6);

  return { slices, ranked, notable, archetype: archetypeFor(ranked) };
}

function archetypeFor(ranked: GenreSlice[]): string {
  if (ranked.length === 0) return 'Eclectic Listener';
  const [top, second] = ranked;
  if (!second || top.pct >= 55) return `${top.label} Purist`;
  if (top.pct - second.pct <= 8) return `${top.label} × ${second.label} Hybrid`;
  return `${top.label}-leaning, with a ${second.label.split(' ')[0]} streak`;
}
