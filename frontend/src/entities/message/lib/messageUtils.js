export function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

export function formatFriendlyDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.floor((startToday - startDate) / (24 * 60 * 60 * 1000));

  if (daysDiff === 0) return "Today";
  if (daysDiff === 1) return "Yesterday";
  if (daysDiff >= 2 && daysDiff <= 6) return `${daysDiff} days ago`;
  if (daysDiff >= 7 && daysDiff <= 13) return "Last week";
  if (daysDiff >= 14 && daysDiff <= 29) return "Last month";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}
