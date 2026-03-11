# AI News Digest — User guide

This guide explains how the app works and how to use the web interface.

---

## What the app does

**AI News Digest** does two main things:

1. **Chat** — Ask questions about recent AI and technology news. Answers are grounded in indexed articles and include **source citations** you can click.
2. **Digest** — Read a **weekly (or custom-range) summary** of articles: categories, titles, links, and short summaries.

The app ingests articles from RSS feeds, stores them, indexes them for search, and uses an AI assistant to answer your questions and generate digests. All of this is available in the browser.

---

## Top bar

- **Logo and title** — “AI News Digest” with subtitle (“RAG-powered news assistant” in Chat, “Weekly article summary” in Digest).
- **Chat / Digest** — Switch between **Chat** (Q&A about news) and **Digest** (read the weekly summary).
- **Chat only:** hamburger menu (☰) opens the **conversations sidebar**; pencil icon starts a **new chat**.

---

## Chat tab

### Conversations sidebar

- Open with the **☰** icon in the top bar (on smaller screens or when the sidebar is hidden).
- **Conversations** — List of your past chats. Click one to open it. Use the **+** in the sidebar to start a new conversation.
- **Folders** — Filter conversations by folder (e.g. “All News”, “Crypto”). Click **Manage** to add folders and RSS feeds (see [Folders and topics](#folders-and-topics)).
- **Delete** — Hover a conversation and use the **×** (or trash) button to delete it.
- Click the overlay or outside the sidebar to close it.

### Main chat area

- **Empty state** — You see “AI News Chat”, a short description, and **suggestion buttons** (e.g. “What’s new in machine learning research?”). Click a suggestion to send that question.
- **Input** — Type your question in the box at the bottom and press **Enter** or click the send (paper plane) icon.
- **Answers** — The assistant replies with markdown. Click any **source link** to open the article. Use the **“N sources”** button when shown to open a list of all cited sources.
- **New chat** — Use the pencil icon in the top bar or **+** in the sidebar to start a new conversation (current one is kept in the list).

### Folders and topics

- **Folders** (e.g. “All News”, “Crypto”) filter which conversations you see and, for custom folders, which RSS feeds are used for that “topic”.
- **Manage** (in the sidebar under Folders) opens **Manage Topics**:
  - **Add Folder** — Create a new folder (e.g. “Crypto”).
  - For a selected folder (not “All News”): **add RSS URLs** for that folder, edit or remove feeds, or **Delete this folder**.

Your chats are stored in the browser (per folder) and persist until you clear site data or delete a conversation.

---

## Digest tab

- **Range** — Use the dropdown to pick the period (e.g. “Last 7 days”, “Last 30 days”). The digest updates when you change it.
- **Refresh Data** — Re-runs the pipeline (ingest RSS → re-index → regenerate digest). Use it after adding feeds or when you want the latest data. It can take a short while.
- **Content** — You get a markdown-style summary: week/period, categories, and for each article: title (link), date, source, and summary. Scroll to read; click titles to open articles.

---

## Summary

| Goal | Where to go |
|------|-------------|
| Ask a question about AI/tech news | **Chat** → type in the input or click a suggestion |
| See sources for an answer | Click links in the reply or the “N sources” button |
| Start a new conversation | Pencil icon (top bar) or **+** in sidebar |
| Switch or review past chats | ☰ → sidebar → click a conversation or folder |
| Manage folders and RSS feeds | **Chat** → sidebar → **Manage** under Folders |
| Read the weekly summary | **Digest** → choose range → read (use **Refresh Data** to update) |

Data is stored in your browser (conversations) and on the server (articles, index, digest). The app works best with a stable connection so the API can load and refresh data.
