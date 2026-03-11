export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function normalizeTopicSlug(value) {
  return value || "all";
}

export function migrateOldChat() {
  const old = loadFromStorage("and:chat", null);
  if (!old || !Array.isArray(old) || old.length === 0) return [];
  localStorage.removeItem("and:chat");
  const id = genId();
  const firstUserMsg = old.find((m) => m.role === "user");
  const title = firstUserMsg ? (firstUserMsg.content.length > 50 ? `${firstUserMsg.content.slice(0, 47)}...` : firstUserMsg.content) : "Previous chat";
  return [{ id, title, messages: old, createdAt: Date.now() }];
}
