/** Ranks vault note paths for the note picker. Pure, so it can be tested without Obsidian. */
const LIMIT = 8;

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0;
  for (const char of haystack) if (char === needle[at] && ++at === needle.length) return true;
  return needle.length === 0;
}

/**
 * With no query, recent notes come first, then the most recently changed. With a query, a name that starts with it wins,
 * then a name that contains it, then a folder match, then letters in order (so "trp" finds "Trip").
 */
export function rankNotes(notes: Array<{ path: string; modified: number }>, query: string, recent: string[]): string[] {
  const text = query.trim().toLowerCase();
  if (!text) {
    const known = new Set(notes.map((note) => note.path));
    const first = recent.filter((path, index) => known.has(path) && recent.indexOf(path) === index);
    const rest = notes.filter((note) => !first.includes(note.path)).sort((a, b) => b.modified - a.modified).map((note) => note.path);
    return [...first, ...rest].slice(0, LIMIT);
  }
  const scored: Array<{ path: string; score: number }> = [];
  for (const { path } of notes) {
    const lower = path.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1).replace(/\.md$/, "");
    const score = name.startsWith(text) ? 0 : name.includes(text) ? 1 : lower.includes(text) ? 2 : isSubsequence(text, lower) ? 3 : -1;
    if (score >= 0) scored.push({ path, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, LIMIT).map((item) => item.path);
}
