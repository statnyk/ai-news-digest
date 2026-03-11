import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import "./Chat.css";

const API_BASE = import.meta.env.VITE_API_URL || "";
const DIGEST_RANGES = [
  { value: "5m", label: "Last 5 minutes" },
  { value: "30m", label: "Last 30 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "1d", label: "Last 1 day" },
  { value: "3d", label: "Last 3 days" },
  { value: "1w", label: "Last 1 week" },
];

const QUESTION_POOL = [
  "What are the latest AI news?",
  "Tell me about recent LLM developments",
  "What's new in machine learning research?",
  "Any breakthroughs in computer vision?",
  "What are companies doing with generative AI?",
  "Are there concerns about AI safety recently?",
  "What open-source AI models were released?",
  "Tell me about AI regulation news",
  "What's happening in robotics and AI?",
  "Any news about AI in healthcare?",
  "What AI startups raised funding recently?",
  "How is AI being used in education?",
];

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeTopicSlug(value) {
  return value || "all";
}

function formatFriendlyDate(timestamp) {
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

function migrateOldChat() {
  const old = loadFromStorage("and:chat", null);
  if (!old || !Array.isArray(old) || old.length === 0) return [];
  localStorage.removeItem("and:chat");
  const id = genId();
  const firstUserMsg = old.find((m) => m.role === "user");
  const title = firstUserMsg ? (firstUserMsg.content.length > 50 ? firstUserMsg.content.slice(0, 47) + "..." : firstUserMsg.content) : "Previous chat";
  return [{ id, title, messages: old, createdAt: Date.now() }];
}

/* ─── Small icon components ──────────────────────────────────── */

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function HeaderLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2L14.5 8.5L21 9.5L16.5 14L17.5 21L12 17.5L6.5 21L7.5 14L3 9.5L9.5 8.5L12 2Z"
        stroke="#b2ff00" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.2" fill="#b2ff00" />
    </svg>
  );
}

function AppLogo({ mode }) {
  if (mode === "digest") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#b2ff00" strokeWidth="1.5" />
        <line x1="7" y1="8" x2="17" y2="8" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="7" y1="12" x2="14" y2="12" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="7" y1="16" x2="11" y2="16" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L14.5 8.5L21 9.5L16.5 14L17.5 21L12 17.5L6.5 21L7.5 14L3 9.5L9.5 8.5L12 2Z" stroke="#b2ff00" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="#b2ff00" opacity="0.25" />
      <circle cx="12" cy="12" r="1.2" fill="#b2ff00" />
    </svg>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function LoadingMessage({ text }) {
  return (
    <div className="chat-loading">
      <div className="chat-message-label">assistant</div>
      <div className="chat-loading-bubble">
        <div className="chat-loading-dots">
          <span className="chat-loading-dot" />
          <span className="chat-loading-dot" />
          <span className="chat-loading-dot" />
        </div>
        <span className="chat-loading-text">{text}</span>
      </div>
    </div>
  );
}

function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function SourcesButton({ count, onClick }) {
  return (
    <button className="sources-toggle-btn" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span>{count} source{count !== 1 ? "s" : ""}</span>
    </button>
  );
}

function SourcesDrawer({ sources, onClose }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div className="sources-overlay" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} role="button" tabIndex={-1} aria-label="Close sources" />
      <aside className="sources-drawer">
        <div className="sources-drawer-header">
          <h3>Sources</h3>
          <button className="sources-drawer-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="sources-drawer-list">
          {sources.map((s, i) => (
            <a key={s.url || i} href={s.url} target="_blank" rel="noopener noreferrer" className="sources-drawer-item">
              <div className="sources-drawer-item-index">{i + 1}</div>
              <div className="sources-drawer-item-content">
                <div className="sources-drawer-item-title">{s.title || "Untitled"}</div>
                <div className="sources-drawer-item-meta">{s.source || new URL(s.url).hostname}</div>
              </div>
              <svg className="sources-drawer-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          ))}
        </div>
      </aside>
    </>
  );
}

function MarkdownLink({ children, ...props }) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const markdownComponents = { a: MarkdownLink };

function MessageBubble({ message, onOpenSources }) {
  const isUser = message.role === "user";
  const uniqueSources = useMemo(
    () => (!isUser && message.sources ? deduplicateSources(message.sources) : []),
    [isUser, message.sources],
  );

  return (
    <div className={`chat-message ${isUser ? "chat-message-user" : "chat-message-assistant"}`}>
      <div className="chat-message-label">{isUser ? "you" : "assistant"}</div>
      <div className="chat-message-bubble">
        {isUser ? message.content : <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>}
      </div>
      {uniqueSources.length > 0 && (
        <SourcesButton count={uniqueSources.length} onClick={() => onOpenSources(uniqueSources)} />
      )}
    </div>
  );
}

function ErrorBubble({ error, onRetry }) {
  return (
    <div className="chat-error">
      <span className="chat-error-text">{error}</span>
      {onRetry && <button className="chat-retry-button" onClick={onRetry}>Retry</button>}
    </div>
  );
}

function WelcomeScreen({
  selectedTopic,
  topic,
  suggestions,
  loadingSuggestions,
  onSuggestionClick,
}) {
  const isAll = selectedTopic === "all" || !topic;
  const title = isAll ? "AI News Chat" : (topic?.welcome_title || (topic?.name ? `${topic.name} Digest` : "Chat"));
  const description = isAll
    ? "Ask questions about recent AI and technology news. Answers are grounded in indexed articles with source citations."
    : (topic?.welcome_description || `Ask questions about ${topic?.name || "this topic"}. Answers are grounded in your indexed articles.`);
  const showSuggestions = Array.isArray(suggestions) && suggestions.length > 0;

  return (
    <div className="chat-welcome">
      <div className="chat-welcome-icon"><AppLogo mode="chat" /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="chat-suggestions">
        {loadingSuggestions && (
          <span className="chat-suggestions-loading">Loading suggestions…</span>
        )}
        {!loadingSuggestions && showSuggestions && suggestions.map((s) => (
          <button key={s} className="chat-suggestion-btn" onClick={() => onSuggestionClick(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function ApiOfflineBanner() {
  return (
    <div className="api-offline-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>Backend API unavailable. Chat and digest features may not work.</span>
    </div>
  );
}

function TopicManagerModal({
  selectedTopic,
  topicLoading,
  newTopicName,
  newSourceUrl,
  onNewTopicNameChange,
  onNewSourceUrlChange,
  onCreateTopic,
  onAddSource,
  onDeleteTopic,
  onClose,
  topicSources,
  loadingSources,
  onRemoveSource,
  onUpdateSource,
}) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div className="topic-modal-overlay" onClick={onClose} />
      <aside className="topic-modal">
        <div className="topic-modal-header">
          <h3>Manage Topics</h3>
          <button className="topic-modal-close" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="topic-modal-body">
          <form onSubmit={onCreateTopic} className="topic-form">
            <input
              className="topic-input"
              value={newTopicName}
              onChange={(e) => onNewTopicNameChange(e.target.value)}
              placeholder="New folder (e.g. Crypto)"
              disabled={topicLoading}
            />
            <button className="topic-btn" type="submit" disabled={topicLoading || !newTopicName.trim()}>
              Add Folder
            </button>
          </form>
          {selectedTopic !== "all" && (
            <>
              <div className="topic-sources-section">
                <div className="topic-sources-label">RSS feeds in this folder</div>
                {loadingSources && <div className="topic-sources-loading">Loading…</div>}
                {!loadingSources && Array.isArray(topicSources) && topicSources.length === 0 && (
                  <div className="topic-sources-empty">No feeds yet. Add one below.</div>
                )}
                {!loadingSources && Array.isArray(topicSources) && topicSources.length > 0 && (
                  <ul className="topic-sources-list">
                    {topicSources.map((src) => (
                      <TopicSourceRow
                        key={src.id}
                        source={src}
                        onRemove={() => onRemoveSource(selectedTopic, src.id)}
                        onUpdate={onUpdateSource ? (url) => onUpdateSource(selectedTopic, src.id, url) : null}
                        disabled={topicLoading}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <form onSubmit={onAddSource} className="topic-form">
                <input
                  className="topic-input"
                  value={newSourceUrl}
                  onChange={(e) => onNewSourceUrlChange(e.target.value)}
                  placeholder="Add RSS URL to this folder"
                  disabled={topicLoading}
                />
                <button className="topic-btn" type="submit" disabled={topicLoading || !newSourceUrl.trim()}>
                  Add RSS
                </button>
              </form>
              <button
                type="button"
                className="topic-delete-btn"
                onClick={() => onDeleteTopic(selectedTopic)}
                disabled={topicLoading}
              >
                Delete this folder
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function TopicSourceRow({ source, onRemove, onUpdate, disabled }) {
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(source.rss_url);

  useEffect(() => { setEditUrl(source.rss_url); }, [source.rss_url]);

  const displayUrl = source.rss_url.length > 56 ? source.rss_url.slice(0, 53) + "…" : source.rss_url;

  return (
    <li className="topic-source-row">
      {editing && onUpdate ? (
        <div className="topic-source-edit">
          <input
            type="url"
            className="topic-input topic-source-edit-input"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            placeholder="https://…"
          />
          <button
            type="button"
            className="topic-btn topic-btn-small"
            onClick={() => { onUpdate(editUrl); setEditing(false); }}
            disabled={disabled || !editUrl.trim()}
          >
            Save
          </button>
          <button type="button" className="topic-btn topic-btn-small" onClick={() => { setEditing(false); setEditUrl(source.rss_url); }}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <a
            href={source.rss_url}
            target="_blank"
            rel="noopener noreferrer"
            className="topic-source-url"
            title={source.rss_url}
          >
            {displayUrl}
          </a>
          <div className="topic-source-actions">
            {onUpdate && (
              <button type="button" className="topic-source-action-btn" onClick={() => setEditing(true)} disabled={disabled} title="Change URL">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
            <button type="button" className="topic-source-action-btn topic-source-remove" onClick={onRemove} disabled={disabled} title="Remove feed">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/* ─── Sidebar ────────────────────────────────────────────────── */

function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
  topics,
  selectedTopic,
  onTopicSelect,
  onManageTopics,
}) {
  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Conversations</span>
          <button className="sidebar-new-btn" onClick={onNew} title="New chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="sidebar-list">
          <div className="sidebar-topic-section">
            <div className="sidebar-topic-header">
              <span className="sidebar-topic-title">Folders</span>
              <button className="sidebar-topic-manage-btn" onClick={onManageTopics}>
                Manage
              </button>
            </div>
            <div className="sidebar-topic-list">
              {topics.map((topic) => (
                <button
                  key={topic.slug}
                  className={`sidebar-topic-chip ${selectedTopic === topic.slug ? "sidebar-topic-chip-active" : ""}`}
                  onClick={() => { onTopicSelect(topic.slug); onClose(); }}
                >
                  {topic.name}
                </button>
              ))}
            </div>
          </div>
          {conversations.length === 0 && (
            <div className="sidebar-empty">No conversations yet</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`sidebar-item ${c.id === activeId ? "sidebar-item-active" : ""}`}
              onClick={() => { onSelect(c.id); onClose(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
            >
              <div className="sidebar-item-content">
                <div className="sidebar-item-title">{c.title}</div>
                <div className="sidebar-item-date">{formatFriendlyDate(c.createdAt)}</div>
              </div>
              <button
                className="sidebar-item-delete"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                title="Delete conversation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

/* ─── Main App ───────────────────────────────────────────────── */

export default function App() {
  const [mode, setMode] = useState(() => loadFromStorage("and:mode", "chat"));
  const [conversations, setConversations] = useState(() => {
    const saved = loadFromStorage("and:convos", null);
    if (saved && saved.length > 0) {
      return saved.map((c) => ({ ...c, topicSlug: normalizeTopicSlug(c.topicSlug) }));
    }
    return migrateOldChat().map((c) => ({ ...c, topicSlug: "all" }));
  });
  const [activeId, setActiveId] = useState(() => {
    const saved = loadFromStorage("and:activeId", null);
    if (saved) return saved;
    if (conversations.length > 0) return conversations[0].id;
    return null;
  });
  const [digestMessages, setDigestMessages] = useState(() => loadFromStorage("and:digest", []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedInput, setLastFailedInput] = useState(null);
  const [drawerSources, setDrawerSources] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topics, setTopics] = useState([{ name: "All News", slug: "all", source_count: 0 }]);
  const [selectedTopic, setSelectedTopic] = useState(() => loadFromStorage("and:selectedTopic", "all"));
  const [newTopicName, setNewTopicName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicSources, setTopicSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [topicSuggestionsMap, setTopicSuggestionsMap] = useState({});
  const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState({});
  const defaultSuggestions = useMemo(() => pickRandom(QUESTION_POOL, 3), []);
  const [digestRange, setDigestRange] = useState(() => loadFromStorage("and:digestRange", "1w"));

  const filteredConversations = useMemo(
    () => conversations.filter((c) => normalizeTopicSlug(c.topicSlug) === selectedTopic),
    [conversations, selectedTopic],
  );
  const activeConvo = filteredConversations.find((c) => c.id === activeId) || null;
  const chatMessages = activeConvo ? activeConvo.messages : [];
  const messages = mode === "chat" ? chatMessages : digestMessages;

  useEffect(() => { saveToStorage("and:convos", conversations); }, [conversations]);
  useEffect(() => { saveToStorage("and:activeId", activeId); }, [activeId]);
  useEffect(() => { saveToStorage("and:digest", digestMessages); }, [digestMessages]);
  useEffect(() => { saveToStorage("and:mode", mode); }, [mode]);
  useEffect(() => { saveToStorage("and:selectedTopic", selectedTopic); }, [selectedTopic]);
  useEffect(() => { saveToStorage("and:digestRange", digestRange); }, [digestRange]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/health`)
      .then((r) => { if (!cancelled) setApiOnline(r.ok || r.status < 500); })
      .catch(() => { if (!cancelled) setApiOnline(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/topics`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server error (${r.status})`))))
      .then((data) => {
        if (cancelled) return;
        const apiTopics = Array.isArray(data.topics) ? data.topics : [];
        setTopics([{ name: "All News", slug: "all", source_count: 0 }, ...apiTopics]);
      })
      .catch(() => {
        if (!cancelled) {
          setTopics([{ name: "All News", slug: "all", source_count: 0 }]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mode !== "chat" || selectedTopic === "all") return;
    if (topicSuggestionsMap[selectedTopic]) return;
    let cancelled = false;
    setTopicSuggestionsLoading((prev) => ({ ...prev, [selectedTopic]: true }));
    fetch(`${API_BASE}/api/topics/${encodeURIComponent(selectedTopic)}/suggestions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load suggestions"))))
      .then((data) => {
        if (cancelled) return;
        setTopicSuggestionsMap((prev) => ({ ...prev, [selectedTopic]: data.suggestions || [] }));
      })
      .catch(() => {
        if (!cancelled) {
          setTopicSuggestionsMap((prev) => ({ ...prev, [selectedTopic]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTopicSuggestionsLoading((prev) => ({ ...prev, [selectedTopic]: false }));
        }
      });
    return () => { cancelled = true; };
  }, [mode, selectedTopic, topicSuggestionsMap]);

  useEffect(() => {
    if (!topicModalOpen || selectedTopic === "all") {
      setTopicSources([]);
      return;
    }
    let cancelled = false;
    setLoadingSources(true);
    fetch(`${API_BASE}/api/topics/${encodeURIComponent(selectedTopic)}/sources`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load sources"))))
      .then((data) => {
        if (cancelled) return;
        setTopicSources(Array.isArray(data.sources) ? data.sources : []);
      })
      .catch(() => {
        if (!cancelled) setTopicSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => { cancelled = true; };
  }, [topicModalOpen, selectedTopic]);

  const digestLoaded = useRef(digestMessages.length > 0);
  useEffect(() => {
    if (mode !== "digest" || digestLoaded.current || loading) return;
    digestLoaded.current = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("range", digestRange);
    if (selectedTopic !== "all") {
      params.set("topic", selectedTopic);
    }
    fetch(`${API_BASE}/api/digest?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Server error (${r.status})`)))
      .then((data) => { if (data.markdown) setDigestMessages([{ role: "assistant", content: data.markdown, sources: [] }]); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [mode, loading, digestMessages.length, selectedTopic, digestRange]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [chatMessages, digestMessages, loading, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, [mode, activeId]);

  function updateConvoMessages(convoId, updater) {
    setConversations((prev) =>
      prev.map((c) => c.id === convoId ? { ...c, messages: updater(c.messages) } : c),
    );
  }

  function createConversation(firstQuestion) {
    const id = genId();
    const title = firstQuestion.length > 50 ? firstQuestion.slice(0, 47) + "..." : firstQuestion;
    const convo = { id, title, messages: [], createdAt: Date.now(), topicSlug: selectedTopic };
    setConversations((prev) => [convo, ...prev]);
    setActiveId(id);
    return id;
  }

  async function sendChatMessage(question) {
    setError(null);
    setLastFailedInput(null);

    let convoId = activeId;
    if (!convoId) {
      convoId = createConversation(question);
    }

    const userMessage = { role: "user", content: question };
    updateConvoMessages(convoId, (msgs) => [...msgs, userMessage]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          ...(selectedTopic !== "all" && { topicSlug: selectedTopic }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      updateConvoMessages(convoId, (msgs) => [...msgs, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      }]);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setLastFailedInput(question);
    } finally {
      setLoading(false);
    }
  }

  async function runPipeline() {
    if (pipelineLoading || loading) return;
    setError(null);
    setPipelineLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectedTopic !== "all" && { topicSlug: selectedTopic }),
          range: digestRange,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.digest?.markdown) {
        setDigestMessages([{ role: "assistant", content: data.digest.markdown, sources: [] }]);
      }
    } catch (err) {
      setError(err.message || "Pipeline failed.");
    } finally {
      setPipelineLoading(false);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    if (mode !== "chat") return;
    const trimmed = input.trim();
    if (!trimmed || loading || pipelineLoading) return;
    setInput("");
    sendChatMessage(trimmed);
  }

  function handleSuggestionClick(suggestion) {
    if (loading || pipelineLoading) return;
    sendChatMessage(suggestion);
  }

  function handleRetry() {
    if (!lastFailedInput) return;
    setError(null);
    sendChatMessage(lastFailedInput);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleModeSwitch(newMode) {
    if (newMode === mode) return;
    setMode(newMode);
    setError(null);
    setLastFailedInput(null);
  }

  function handleTopicSelect(slug) {
    setSelectedTopic(slug);
    setActiveId(null);
    setError(null);
    digestLoaded.current = false;
    setDigestMessages([]);
  }

  function handleNewChat() {
    setActiveId(null);
    setError(null);
    setLastFailedInput(null);
    setInput("");
  }

  async function handleCreateTopic(e) {
    e.preventDefault();
    const name = newTopicName.trim();
    if (!name) return;
    setTopicLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create topic.");
      const created = data.topic;
      if (created) {
        setTopics((prev) => {
          const withoutDupes = prev.filter((t) => t.slug !== created.slug);
          return [withoutDupes[0], created, ...withoutDupes.slice(1)];
        });
        handleTopicSelect(created.slug);
        setNewTopicName("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTopicLoading(false);
    }
  }

  async function handleAddSource(e) {
    e.preventDefault();
    if (selectedTopic === "all") return;
    const rssUrl = newSourceUrl.trim();
    if (!rssUrl) return;
    setTopicLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${selectedTopic}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rssUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add RSS URL.");
      setNewSourceUrl("");
      setTopicSources((prev) => (data.source ? [...prev, data.source] : prev));
    } catch (err) {
      setError(err.message);
    } finally {
      setTopicLoading(false);
    }
  }

  async function handleRemoveSource(slug, sourceId) {
    setTopicLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${encodeURIComponent(slug)}/sources/${sourceId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove feed.");
      setTopicSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (err) {
      setError(err.message);
    } finally {
      setTopicLoading(false);
    }
  }

  async function handleUpdateSource(slug, sourceId, rssUrl) {
    const url = (typeof rssUrl === "string" ? rssUrl : "").trim();
    if (!url) return;
    setTopicLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${encodeURIComponent(slug)}/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rssUrl: url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update feed.");
      if (data.source) {
        setTopicSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, ...data.source, rss_url: data.source.rss_url ?? data.source.rssUrl ?? s.rss_url } : s)));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTopicLoading(false);
    }
  }

  async function handleDeleteTopic(slug) {
    if (slug === "all") return;
    setTopicLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${encodeURIComponent(slug)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete folder.");
      setTopics((prev) => prev.filter((t) => t.slug !== slug));
      setConversations((prev) => prev.map((c) => (c.topicSlug === slug ? { ...c, topicSlug: "all" } : c)));
      setTopicSuggestionsMap((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
      if (selectedTopic === slug) {
        setSelectedTopic("all");
        setActiveId(null);
      }
      setTopicModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setTopicLoading(false);
    }
  }

  function handleDeleteConvo(id) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setError(null);
    }
  }

  const hasMessages = messages.length > 0;
  const isAnyLoading = loading || pipelineLoading;

  let loadingText = "Generating digest...";
  if (pipelineLoading) loadingText = "Updating database...";
  else if (mode === "chat") loadingText = "Thinking...";

  return (
    <>
      {mode === "chat" && (
        <ChatSidebar
          conversations={filteredConversations}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setError(null); }}
          onNew={handleNewChat}
          onDelete={handleDeleteConvo}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          topics={topics}
          selectedTopic={selectedTopic}
          onTopicSelect={handleTopicSelect}
          onManageTopics={() => setTopicModalOpen(true)}
        />
      )}

      <div className={`app-main ${mode === "chat" ? "app-main-with-sidebar" : ""}`}>
        <header className="chat-header">
          <div className="chat-header-inner">
            <div className="chat-header-left">
              {mode === "chat" && (
                <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Toggle conversations">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              )}
              <div className="chat-header-logo">
                <HeaderLogo />
              </div>
              <div>
                <div className="chat-header-title">AI News Digest</div>
                <div className="chat-header-subtitle">
                  {mode === "chat" ? "RAG-powered news assistant" : "Weekly article summary"}
                </div>
              </div>
            </div>
            <div className="chat-header-right">
              {mode === "chat" && (
                <button className="clear-btn" onClick={handleNewChat} disabled={isAnyLoading || !activeId} title="New chat">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              )}
              {mode === "digest" && (
                <>
                  <select
                    className="digest-range-select"
                    value={digestRange}
                    onChange={(e) => {
                      setDigestRange(e.target.value);
                      digestLoaded.current = false;
                      setDigestMessages([]);
                    }}
                    disabled={isAnyLoading}
                  >
                    {DIGEST_RANGES.map((rangeOption) => (
                      <option key={rangeOption.value} value={rangeOption.value}>
                        {rangeOption.label}
                      </option>
                    ))}
                  </select>
                  <button className="refresh-btn" onClick={runPipeline} disabled={isAnyLoading} title="Re-ingest RSS feeds, re-index vectors, and regenerate digest">
                    <RefreshIcon />
                    <span>Refresh Data</span>
                  </button>
                </>
              )}
              <div className="mode-switcher">
                <button className={`mode-btn ${mode === "chat" ? "active" : ""}`} onClick={() => handleModeSwitch("chat")}>Chat</button>
                <button className={`mode-btn ${mode === "digest" ? "active" : ""}`} onClick={() => handleModeSwitch("digest")}>Digest</button>
              </div>
            </div>
          </div>
        </header>

        {!apiOnline && <ApiOfflineBanner />}

        <div className="chat-container">
          <div className="chat-scroll-view">
            <div className="chat-messages">
            {!hasMessages && !isAnyLoading && mode === "chat" && (
              <WelcomeScreen
                selectedTopic={selectedTopic}
                topic={topics.find((t) => t.slug === selectedTopic)}
                suggestions={selectedTopic === "all" ? defaultSuggestions : (topicSuggestionsMap[selectedTopic] || [])}
                loadingSuggestions={selectedTopic !== "all" && !!topicSuggestionsLoading[selectedTopic]}
                onSuggestionClick={handleSuggestionClick}
              />
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} onOpenSources={setDrawerSources} />
            ))}

            {isAnyLoading && <LoadingMessage text={loadingText} />}
            {error && <ErrorBubble error={error} onRetry={handleRetry} />}
            <div ref={messagesEndRef} />
            </div>
          </div>

          {mode === "chat" && (
            <div className="chat-input-area">
              <form onSubmit={handleSubmit} className="chat-input-wrapper">
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about AI news..."
                  rows={1}
                  disabled={isAnyLoading}
                />
                <button type="submit" className="chat-send-btn" disabled={isAnyLoading || !input.trim()}>
                  <SendIcon />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {drawerSources && (
        <SourcesDrawer sources={drawerSources} onClose={() => setDrawerSources(null)} />
      )}
      {topicModalOpen && (
        <TopicManagerModal
          selectedTopic={selectedTopic}
          topicLoading={topicLoading}
          newTopicName={newTopicName}
          newSourceUrl={newSourceUrl}
          onNewTopicNameChange={setNewTopicName}
          onNewSourceUrlChange={setNewSourceUrl}
          onCreateTopic={handleCreateTopic}
          onAddSource={handleAddSource}
          onDeleteTopic={handleDeleteTopic}
          onClose={() => setTopicModalOpen(false)}
        />
      )}
    </>
  );
}
