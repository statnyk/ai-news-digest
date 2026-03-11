import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import "./Chat.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

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

function AppLogo({ mode }) {
  if (mode === "digest") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="#b2ff00" strokeWidth="1.5" />
        <line x1="7" y1="8" x2="17" y2="8" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="7" y1="12" x2="14" y2="12" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="7" y1="16" x2="11" y2="16" stroke="#b2ff00" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <circle cx="17.5" cy="15.5" r="2.5" fill="#b2ff00" opacity="0.3" />
        <path d="M16.5 15.5l1 1 2-2" stroke="#b2ff00" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
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

function HeaderLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2L14.5 8.5L21 9.5L16.5 14L17.5 21L12 17.5L6.5 21L7.5 14L3 9.5L9.5 8.5L12 2Z"
        stroke="#b2ff00" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.2" fill="#b2ff00" />
    </svg>
  );
}

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
    const key = s.url;
    if (seen.has(key)) return false;
    seen.add(key);
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
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
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
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown>{message.content}</ReactMarkdown>
        )}
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
      {onRetry && (
        <button className="chat-retry-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function WelcomeScreen({ mode, onSuggestionClick }) {
  const suggestions = useMemo(
    () => (mode === "chat" ? pickRandom(QUESTION_POOL, 3) : ["Generate weekly digest"]),
    [mode],
  );

  return (
    <div className="chat-welcome">
      <div className="chat-welcome-icon">
        <AppLogo mode={mode} />
      </div>
      <h2>{mode === "chat" ? "AI News Chat" : "Weekly Digest"}</h2>
      <p>
        {mode === "chat"
          ? "Ask questions about recent AI and technology news. Answers are grounded in indexed articles with source citations."
          : "Generate a curated markdown digest of the week's top AI and tech articles."}
      </p>
      <div className="chat-suggestions">
        {suggestions.map((s) => (
          <button key={s} className="chat-suggestion-btn" onClick={() => onSuggestionClick(s)}>
            {s}
          </button>
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

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export default function App() {
  const [mode, setMode] = useState(() => loadFromStorage("and:mode", "chat"));
  const [chatMessages, setChatMessages] = useState(() => loadFromStorage("and:chat", []));
  const [digestMessages, setDigestMessages] = useState(() => loadFromStorage("and:digest", []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedInput, setLastFailedInput] = useState(null);
  const [drawerSources, setDrawerSources] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);

  useEffect(() => { localStorage.setItem("and:chat", JSON.stringify(chatMessages)); }, [chatMessages]);
  useEffect(() => { localStorage.setItem("and:digest", JSON.stringify(digestMessages)); }, [digestMessages]);
  useEffect(() => { localStorage.setItem("and:mode", JSON.stringify(mode)); }, [mode]);

  const messages = mode === "chat" ? chatMessages : digestMessages;

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/health`)
      .then((r) => { if (!cancelled) setApiOnline(r.ok || r.status < 500); })
      .catch(() => { if (!cancelled) setApiOnline(false); });
    return () => { cancelled = true; };
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, digestMessages, loading, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  async function sendChatMessage(question) {
    setError(null);
    setLastFailedInput(null);

    const userMessage = { role: "user", content: question };
    setChatMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      const assistantMessage = {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setLastFailedInput(question);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDigest() {
    setError(null);
    setLastFailedInput(null);

    const userMessage = { role: "user", content: "Generate weekly digest" };
    setDigestMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/digest`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      const assistantMessage = {
        role: "assistant",
        content: data.markdown || "No digest available.",
        sources: [],
      };
      setDigestMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err.message || "Failed to fetch digest.");
      setLastFailedInput("__digest__");
    } finally {
      setLoading(false);
    }
  }

  async function runPipeline() {
    if (pipelineLoading || loading) return;
    setError(null);
    setPipelineLoading(true);

    const userMessage = { role: "user", content: "Refresh data: re-ingest RSS, re-index vectors, regenerate digest" };
    setDigestMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch(`${API_BASE}/api/pipeline`, { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const data = await res.json();
      const summary = [
        `Pipeline completed successfully.`,
        `- Articles ingested: ${data.ingested ?? "N/A"}`,
        `- Chunks indexed: ${data.indexed ?? "N/A"}`,
        `- Digest articles: ${data.digest?.articleCount ?? "N/A"}`,
        "",
        data.digest?.markdown || "",
      ].join("\n");

      setDigestMessages((prev) => [...prev, { role: "assistant", content: summary, sources: [] }]);
    } catch (err) {
      setError(err.message || "Pipeline failed.");
    } finally {
      setPipelineLoading(false);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading || pipelineLoading) return;

    setInput("");
    if (mode === "chat") {
      sendChatMessage(trimmed);
    } else {
      fetchDigest();
    }
  }

  function handleSuggestionClick(suggestion) {
    if (loading || pipelineLoading) return;
    if (mode === "digest" || suggestion === "Generate weekly digest") {
      fetchDigest();
    } else {
      sendChatMessage(suggestion);
    }
  }

  function handleRetry() {
    if (!lastFailedInput) return;
    setError(null);
    if (lastFailedInput === "__digest__") {
      fetchDigest();
    } else {
      sendChatMessage(lastFailedInput);
    }
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

  function clearHistory() {
    if (mode === "chat") setChatMessages([]);
    else setDigestMessages([]);
    setError(null);
    setLastFailedInput(null);
  }

  const hasMessages = messages.length > 0;
  const isAnyLoading = loading || pipelineLoading;

  let loadingText = "Generating digest...";
  if (pipelineLoading) loadingText = "Updating database...";
  else if (mode === "chat") loadingText = "Thinking...";

  return (
    <>
      <header className="chat-header">
        <div className="chat-header-inner">
          <div className="chat-header-left">
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
            {hasMessages && (
              <button
                className="clear-btn"
                onClick={clearHistory}
                disabled={isAnyLoading}
                title="Clear conversation history"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
            {mode === "digest" && (
              <button
                className="refresh-btn"
                onClick={runPipeline}
                disabled={isAnyLoading}
                title="Re-ingest RSS feeds, re-index vectors, and regenerate digest"
              >
                <RefreshIcon />
                <span>Refresh Data</span>
              </button>
            )}
            <div className="mode-switcher">
              <button
                className={`mode-btn ${mode === "chat" ? "active" : ""}`}
                onClick={() => handleModeSwitch("chat")}
              >
                Chat
              </button>
              <button
                className={`mode-btn ${mode === "digest" ? "active" : ""}`}
                onClick={() => handleModeSwitch("digest")}
              >
                Digest
              </button>
            </div>
          </div>
        </div>
      </header>

      {!apiOnline && <ApiOfflineBanner />}

      <div className="chat-container">
        <div className="chat-messages">
          {!hasMessages && !isAnyLoading && (
            <WelcomeScreen mode={mode} onSuggestionClick={handleSuggestionClick} />
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} onOpenSources={setDrawerSources} />
          ))}

          {isAnyLoading && <LoadingMessage text={loadingText} />}

          {error && <ErrorBubble error={error} onRetry={handleRetry} />}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form onSubmit={handleSubmit} className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "chat" ? "Ask about AI news..." : "Press send to generate digest..."}
              rows={1}
              disabled={isAnyLoading}
            />
            <button type="submit" className="chat-send-btn" disabled={isAnyLoading || (!input.trim() && mode === "chat")}>
              <SendIcon />
            </button>
          </form>
        </div>
      </div>

      {drawerSources && (
        <SourcesDrawer sources={drawerSources} onClose={() => setDrawerSources(null)} />
      )}
    </>
  );
}
