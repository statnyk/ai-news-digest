# AI News Digest -- Frontend

React + Vite single-page application providing the Chat and Digest UI for the AI News Digest system.

## Quick start

From the **project root** (not this directory):

```bash
docker compose up -d          # Start backend + infrastructure
npm run dev --prefix frontend # Start Vite dev server
```

Open **http://localhost:5173/** -- the Vite dev server proxies `/api` requests to the backend API on port 3001.

Alternatively, run both API and UI together:

```bash
npm run dev   # from project root -- starts API + Vite concurrently
```

## What this app does

- **Chat tab** -- Ask questions about AI/tech news. Answers are RAG-grounded with source citations.
- **Digest tab** -- Read weekly (or custom-range) summaries of ingested articles. Click "Refresh Data" to trigger the full pipeline.
- **Topics/Folders** -- Create folders with custom RSS feeds for filtered conversations and digests.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | (empty) | API base URL. Empty means same-origin (Vite proxy handles it in dev; built frontend is served by the API in production). |

## More info

- **Full setup, n8n workflows, and deployment:** See the [root README](../README.md)
- **n8n workflow import guide:** See [docs/N8N-QUICKSTART.md](../docs/N8N-QUICKSTART.md)
- **UI user guide:** See [docs/USER-GUIDE.md](../docs/USER-GUIDE.md)
