const RECORDS_KEY = 'kpl-merge:records:v1';
const validScore = score => Number.isSafeInteger(score) && score >= 0;

export function readRecords(storage) {
  try {
    const value = JSON.parse(storage.getItem(RECORDS_KEY));
    if (validScore(value?.bestScore)) {
      const first = value.firstFavorite;
      const firstFavorite = validScore(first?.score) && typeof first.teamId === 'string' && first.teamId ? first : null;
      return { bestScore: Math.max(value.bestScore, firstFavorite?.score ?? 0), firstFavorite };
    }
  } catch { /* Storage can be blocked or contain invalid JSON. */ }
  return { bestScore: 0, firstFavorite: null };
}

export function recordScore(storage, previous, score, teamId = null) {
  const saved = readRecords(storage);
  const bestScore = Math.max(saved.bestScore, previous.bestScore, score);
  const firstFavorite = saved.firstFavorite ?? previous.firstFavorite ?? (teamId ? { teamId, score } : null);
  const records = { bestScore, firstFavorite };
  if (bestScore !== saved.bestScore || firstFavorite !== saved.firstFavorite) {
    try { storage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch { /* Keep the record in memory. */ }
  }
  return records;
}
