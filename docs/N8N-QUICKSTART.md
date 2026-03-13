# n8n Quick Start -- Import Workflows and Run Locally

This guide walks you through starting the full stack locally, importing all n8n workflows, configuring credentials, and using the app the same way the author does.

## 1. Start the stack

```bash
# From the project root
docker compose up -d
```

This starts four services:

| Service | Port | Purpose |
|---------|------|---------|
| **postgres** | 5432 | PostgreSQL 16 with pgvector (two databases: `ai_news_digest` for app data, `n8n` for n8n internals) |
| **qdrant** | 6333 | Qdrant vector store for semantic search |
| **n8n** | 5678 | Workflow engine (visual automation) |
| **app** | 3001 | Backend API (Express) serving REST endpoints |

Then start the frontend dev server:

```bash
npm run dev --prefix frontend
```

Open **http://localhost:5173/** in your browser. The Vite dev server proxies `/api` requests to the backend on port 3001.

## 2. First-time setup

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `OPENAI_API_KEY` -- your OpenAI API key (required for summaries, embeddings, and chat)

The default Postgres and Qdrant values work with the Docker Compose setup out of the box.

Then run migrations to create the database tables:

```bash
npm run setup
# or: npm run migrate (includes topic tables for custom folders)
```

> The backend also runs migrations automatically in dev mode on startup. To skip that, set `SKIP_DEV_MIGRATE=true`.

## 3. Import workflows in n8n

1. Open n8n at **http://localhost:5678**
2. Go to **Workflows** -> **Import from File** (or drag-and-drop the JSON files)
3. Import **all five** workflows from `src/workflows/`:

| File | What it does |
|------|-------------|
| `01-rss-to-database.json` | Fetches RSS feeds, normalizes articles, inserts into PostgreSQL (dedup by URL) |
| `02-weekly-digest.json` | Queries articles by date range, generates Markdown digest grouped by category |
| `03-vector-indexing.json` | Chunks unindexed articles, generates embeddings, upserts into Qdrant |
| `04-rag-chat-agent.json` | Receives a question via webhook, searches Qdrant + PostgreSQL, returns a cited answer |
| `05-pipeline.json` | Single webhook that runs the full pipeline: ingest -> digest (used by the frontend "Refresh Data" button) |

## 4. Configure credentials in n8n

After importing, each workflow has nodes that reference placeholder credential IDs. You need to create real credentials and assign them.

### PostgreSQL (App Database)

Go to **Credentials** -> **New Credential** -> **Postgres**:

| Field | Value |
|-------|-------|
| Host | `postgres` |
| Port | `5432` |
| Database | `ai_news_digest` (or your `POSTGRES_DB` value) |
| User | `postgres` (or your `POSTGRES_USER` value) |
| Password | `changeme` (or your `POSTGRES_PASSWORD` value) |

> Use Docker service names (`postgres`, not `localhost`) because n8n runs inside the same Docker network.

> **Important:** This credential is for **workflow nodes** that read/write `articles`, `topics`, etc. It is NOT the same database that n8n uses internally (n8n uses the `n8n` database automatically via its `DB_POSTGRESDB_*` env vars). See [docs/railway-n8n-setup.md](railway-n8n-setup.md) for the two-database architecture.

### OpenAI

Go to **Credentials** -> **New Credential** -> **OpenAI API**:

| Field | Value |
|-------|-------|
| API Key | Your OpenAI API key |

### Qdrant (used by workflow 03)

Workflow 03 uses an **HTTP Request** node to call Qdrant's REST API directly. The URL is set to `http://qdrant:6333` in the workflow JSON. If your Qdrant is at a different address, update the HTTP Request node URL.

### Assign credentials to workflow nodes

Open each imported workflow and update every **Postgres** and **OpenAI** node to use the credentials you just created:

1. Click on a Postgres node -> **Credential** dropdown -> select your "App Database" credential.
2. Click on an OpenAI / HTTP Request (OpenAI) node -> **Credential** dropdown -> select your OpenAI credential.
3. Save the workflow.

Repeat for all five workflows.

## 5. Use it

### From n8n

- **Manual trigger:** Open any workflow and click **Execute Workflow** (the play button). Workflows 01-04 have a Manual Trigger node for this.
- **Scheduled:** Workflow 01 (RSS) runs every 6 hours; workflow 02 (Digest) runs Monday 9AM; workflow 03 (Indexing) runs every 2 hours. Activate the workflow to enable the schedule.
- **Webhook:** Workflows 02, 04, and 05 have webhook triggers. Once activated, they respond to HTTP requests at `http://localhost:5678/webhook/<path>`.

### From the frontend (http://localhost:5173/)

- **Chat tab** -- Ask questions about AI/tech news. The backend calls the RAG chat service (or forwards to n8n if `N8N_WEBHOOK_BASE_URL` is set).
- **Digest tab** -- Read the weekly summary. Click **Refresh Data** to trigger the full pipeline (ingest + index + digest). Change the range dropdown (5 min to 2 weeks) and it regenerates.
- **Topics/Folders** -- In the Chat sidebar, click **Manage** to create folders with custom RSS feeds. Each folder gets its own ingestion and digest.

### Connecting the frontend to n8n webhooks (optional)

By default, the backend runs the pipeline using Node.js services directly. To route requests through n8n instead:

1. In `.env`, set `N8N_WEBHOOK_BASE_URL=http://n8n:5678/webhook` (Docker internal) or `http://localhost:5678/webhook` (from host).
2. Restart the backend (`docker compose restart app` or re-run `npm run dev`).
3. Now "Refresh Data", Chat, and Digest requests will be forwarded to the n8n webhook endpoints.

## Typical workflow

1. **Start stack:** `docker compose up -d` + `npm run dev --prefix frontend`
2. **Open UI:** http://localhost:5173/
3. **Click "Refresh Data"** in Digest tab (triggers RSS ingest + digest generation)
4. **Switch to Chat** and ask questions about the ingested articles
5. **Optionally** open n8n at http://localhost:5678/ to monitor workflow executions, adjust schedules, or add custom logic

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `relation "articles" does not exist` in n8n | Your Postgres credential points at the `n8n` database. Switch it to the app database (`ai_news_digest`). See [railway-n8n-setup.md](railway-n8n-setup.md#8-two-databases-two-credentials-important). |
| n8n "Migrations failed" | n8n can't reach its own database. Check `DB_POSTGRESDB_*` env vars. See [n8n-production-database.md](n8n-production-database.md). |
| Frontend shows network error | Backend not running. Check `docker compose ps` -- the `app` service should be healthy. |
| Qdrant connection refused in workflow 03 | Use `http://qdrant:6333` (Docker service name), not `localhost`. |
| Chat returns empty answers | No articles indexed yet. Run workflow 01 (ingest) then 03 (index), or click "Refresh Data" in the UI. |
