# AI News Digest + RAG Agent

An end-to-end system that ingests AI/tech news from RSS feeds, persists articles to PostgreSQL, generates weekly Markdown digests, indexes content into a Qdrant vector store, and exposes a RAG-powered chat agent that answers questions with cited sources.

Built with **Node.js** + **n8n** workflows. The project consists of two apps that share this repo:

| App | Technology | Port | Purpose |
|-----|-----------|------|---------|
| **Backend API** | Node.js / Express | 3001 | REST API: ingestion, digest, chat, pipeline endpoints. Serves the built frontend in production. |
| **Frontend** | React / Vite | 5173 (dev) | Browser UI for Chat and Digest. Proxies `/api` requests to the backend. |

Both apps are packaged into a single Docker image for production (Railway). n8n workflows (`src/workflows/`) run inside the n8n container and use `n8n-nodes-base.*` nodes to talk to the same PostgreSQL / Qdrant / OpenAI services.

## Live app

- **Production:** [https://ai-news-digest-production.up.railway.app/](https://ai-news-digest-production.up.railway.app/)
- **User guide:** See [docs/USER-GUIDE.md](docs/USER-GUIDE.md) for how the app works and how to use the UI.
- **n8n quick-start (import workflows, add creds, run locally):** See [docs/N8N-QUICKSTART.md](docs/N8N-QUICKSTART.md)

### Deploy (Railway)

The production app auto-deploys on every push to the `n8n` branch via GitHub Actions:

1. **GitHub Actions** ([`.github/workflows/n8n-railway.yml`](.github/workflows/n8n-railway.yml)): Test -> Build Docker image -> Push to GHCR (`ghcr.io/statnyk/ai-news-digest:n8n-latest`) -> Trigger Railway deploy.
2. **Railway** redeploys the App service from the new image. Config: [`railway.json`](railway.json), health check at `/api/health`.

A separate scheduled workflow ([`.github/workflows/rag-pipeline.yml`](.github/workflows/rag-pipeline.yml)) runs daily at 06:00 UTC: it SSHs into Railway to run migrations, then triggers the full pipeline (`POST /api/pipeline`).

To enable the Railway deploy hook, add `RAILWAY_DEPLOY_HOOK_URL` as a GitHub repository secret (copy it from Railway service -> Settings -> Deploy -> Deploy Hook). Without the secret, CI still tests and pushes the image; it just skips calling Railway.

For full Railway setup (Postgres, two databases, n8n, env vars), see [docs/railway-n8n-setup.md](docs/railway-n8n-setup.md).

### Custom domain (Railway)

To use your own URL (e.g. `news.yourdomain.com`):

1. In [Railway](https://railway.app) open your project -> the service -> **Settings** -> **Networking** -> **Public Networking**.
2. Under **Custom Domains**, click **Add custom domain** and enter your domain (e.g. `news.yourdomain.com`).
3. Railway will show a target host (e.g. `ai-news-digest-production.up.railway.app`). In your DNS provider, add a **CNAME** record:
   - **Name:** subdomain you want (e.g. `news` for `news.yourdomain.com`)
   - **Value / Target:** the Railway host from step 2
4. Wait for DNS to propagate; Railway will issue an SSL certificate automatically.

For root domains (`yourdomain.com`) your DNS must support CNAME flattening or ALIAS. See [Railway's Public Networking guide](https://docs.railway.app/guides/public-networking) for details.

## Architecture

```
+----------------------------------------------------------------------+
|                           Data Flow                                   |
|                                                                       |
|  RSS Feeds --> n8n / Node.js --> PostgreSQL                           |
|  (TechCrunch,    (Normalize,       (articles table)                   |
|   Ars Technica,   Dedup,                |                             |
|   The Verge)      Enrich)               |                             |
|                                         +---> Weekly Digest           |
|                                         |     (Markdown via API/n8n)  |
|                                         |                             |
|                                         v                             |
|                                  Chunking + Embeddings                |
|                                  (500 chars, 50 overlap, sentence-    |
|                                   aware, batch of 20)                 |
|                                         |                             |
|                                         v                             |
|                                  Qdrant Vector Store                  |
|                                  (1536-dim cosine, upsert w/ wait)   |
|                                         |                             |
|                                         v                             |
|                                  RAG Chat Agent                       |
|                                  (Hybrid: Qdrant + SQL ILIKE)        |
|                                  . Retrieve top-5 chunks             |
|                                  . Generate grounded answer          |
|                                  . Cite source URLs                  |
|                                                                       |
|  Frontend (React / Vite) <---- /api/* ----> Backend (Express:3001)   |
|  http://localhost:5173 (dev)                                          |
+----------------------------------------------------------------------+
```

## Quick Start

### Prerequisites

- **Docker** & **Docker Compose** (v2+)
- **Node.js** 18+ and npm
- **OpenAI API key** ([get one here](https://platform.openai.com/api-keys))

### 1. Clone & Install

```bash
git clone <repo-url>
cd ai-news-digest
npm install
npm install --prefix frontend
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env -- at minimum set OPENAI_API_KEY
```

> **Security:** `.env` is gitignored. Never commit `.env` or put real API keys in workflow JSON files. See `.env.example` for all available variables with safe placeholder values.

### 3. Start Infrastructure

```bash
docker compose up -d
# Starts: PostgreSQL (5432), Qdrant (6333), n8n (5678), App API (3001)
```

### 4. Run Setup

```bash
npm run setup
# Creates database tables + Qdrant collection
```

For **topic folders** (custom RSS per folder), run all migrations:

```bash
npm run migrate
```

### 5. Local development (API + UI)

```bash
npm run dev --prefix frontend
```

This starts the Vite dev server on **http://localhost:5173/** which proxies `/api` requests to the backend API running in Docker on port 3001.

Alternatively, run both API and UI from source (without the Docker `app` service):

```bash
npm run dev
```

In development (`NODE_ENV` not set to `production`), the API runs migrations on startup so topic tables exist and "Create topic" works locally. To skip auto-migrate (e.g. you run migrate yourself), set `SKIP_DEV_MIGRATE=true`.

### 6. Run the Pipeline

```bash
# Step 1: Ingest articles from RSS feeds
npm run ingest

# Step 2: Index articles into vector store
npm run index

# Step 3: Generate weekly digest
npm run digest

# Step 4: Start interactive RAG chat
npm run chat
```

Or run the full demo pipeline at once:

```bash
npm run demo
```

### 7. Import n8n workflows (optional)

If you want to use n8n workflows instead of (or alongside) the Node.js pipeline, see the full guide: **[docs/N8N-QUICKSTART.md](docs/N8N-QUICKSTART.md)**

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_HOST` | | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | | `5432` | PostgreSQL port |
| `POSTGRES_DB` | | `ai_news_digest` | Database name |
| `POSTGRES_USER` | | `postgres` | Database user |
| `POSTGRES_PASSWORD` | | `changeme` | Database password |
| `QDRANT_URL` | | `http://localhost:6333` | Qdrant REST endpoint |
| `QDRANT_COLLECTION` | | `articles` | Qdrant collection name |
| `OPENAI_API_KEY` | **Yes** | -- | OpenAI API key |
| `OPENAI_EMBEDDING_MODEL` | | `text-embedding-3-small` | Embedding model |
| `OPENAI_CHAT_MODEL` | | `gpt-4o-mini` | LLM for chat + summaries |
| `RSS_FEEDS` | | 3 defaults | Comma-separated RSS URLs |
| `DIGEST_OUTPUT_DIR` | | `./outputs` | Where digests are saved |
| `DIGEST_DAYS` | | `7` | Days to cover in digest |
| `RAG_TOP_K` | | `5` | Chunks retrieved per query |
| `RAG_SIMILARITY_THRESHOLD` | | `0.7` | Minimum similarity score |
| `CHUNK_SIZE` | | `500` | Characters per chunk |
| `CHUNK_OVERLAP` | | `50` | Overlap between chunks |
| `N8N_WEBHOOK_BASE_URL` | | (empty) | When set, backend forwards digest/chat/pipeline to n8n webhooks |
| `VITE_API_URL` | | (empty) | Frontend API base URL (empty = same origin via proxy) |

## How It Works

### Data pipeline (ingestion -> indexing -> digest)

The system processes data in three stages that can run via Node.js CLI, the `/api/pipeline` endpoint, or n8n workflows:

**Stage 1 -- RSS Ingestion.** Fetches articles from 3 default RSS feeds (configurable via `RSS_FEEDS`). Each item is normalized (HTML stripped, dates parsed, source detected from domain map), and inserted into PostgreSQL with `ON CONFLICT (url) DO NOTHING` for idempotent deduplication. If an article has no summary, an LLM generates a 1-2 sentence summary from the first 3000 characters of content. Per-feed error isolation means one failing feed does not block others.

**Stage 2 -- Vector Indexing (Qdrant).** Reads articles where `indexed_at IS NULL` (incremental -- only new articles). Each article's content is split into chunks using sentence-aware splitting (regex on `.!?\n` boundaries) with configurable size (default 500 chars) and overlap (default 50 chars). The article title is prepended to each chunk before embedding to improve retrieval quality. Embeddings are generated via OpenAI `text-embedding-3-small` (1536 dimensions) in batches of 20 chunks per API call. Points are upserted into Qdrant with `wait: true` and rich metadata (article_id, source, category, published_at, url). After successful indexing, `indexed_at = NOW()` is set to prevent re-processing.

**Stage 3 -- Weekly Digest.** Queries articles from the selected time range (5m / 30m / 1h / 1d / 3d / 1w / 2w), groups by category sorted by count, and generates a Markdown report with linked titles, dates, sources, and summaries. For topic-specific digests with no articles in the selected range, a 12-month fallback query runs automatically.

### Optimization numbers

| Metric | Value | Why |
|--------|-------|-----|
| Embedding batch size | 20 chunks / API call | Balances throughput vs. single-request latency; avoids token-limit errors |
| Chunk size | 500 characters | Small enough for precise retrieval, large enough to preserve sentence context |
| Chunk overlap | 50 characters | Prevents information loss at chunk boundaries without excessive duplication (~10% overlap) |
| Embedding dimensions | 1536 (text-embedding-3-small) | Best cost/quality ratio at $0.02 / 1M tokens; sufficient for news-domain semantic search |
| Qdrant distance | Cosine similarity | Scale-invariant; standard for text embeddings |
| Point ID scheme | `article_id * 10000 + chunk_index` | Deterministic; allows re-indexing the same article without duplicates |
| Dedup strategy | `ON CONFLICT (url) DO NOTHING` | Zero-cost at insert time; URL uniqueness is natural for RSS articles |
| Incremental indexing | `WHERE indexed_at IS NULL` | Only embeds new articles; avoids redundant OpenAI API calls |
| RAG retrieval | Top-5 chunks + 0.7 similarity threshold | Balances context window usage vs. recall; hybrid search adds SQL ILIKE fallback |
| Summary enrichment | LLM on first 3000 chars | Caps input cost; 3000 chars is enough for a meaningful summary |

### RAG Chat Agent

The chat agent implements hybrid search: the user's question is embedded and searched against Qdrant (vector similarity), and if results are sparse, a SQL `ILIKE` keyword fallback runs against PostgreSQL. Sources are deduplicated by `article_id`. The system prompt enforces grounded answers with mandatory `[Title](URL)` citations. The LLM used is `gpt-4o-mini` (fast, cheap); swap to `gpt-4o` via `OPENAI_CHAT_MODEL` for higher quality.

## Workflows

### 1. RSS -> Database Ingestion

**File:** `src/workflows/01-rss-to-database.json`
**Node.js:** `npm run ingest` (`src/services/rssIngestion.js`)

- Fetches from 3 configurable RSS feeds (TechCrunch, Ars Technica, The Verge)
- Normalizes RSS items into consistent `article` records
- Strips HTML from content, extracts categories
- Generates LLM summaries when RSS doesn't provide one
- **Deduplicates by URL** (`ON CONFLICT (url) DO NOTHING`)
- Logs errors to `workflow_errors` table
- Scheduled: every 6 hours (cron in n8n) or manual trigger

### 2. Weekly Digest (Markdown Output)

**File:** `src/workflows/02-weekly-digest.json`
**Node.js:** `npm run digest` (`src/services/weeklyDigest.js`)
**Output:** `outputs/weekly-digest-YYYY-MM-DD.md`

- Queries articles from last 7 days (or configurable range: 5m to 2w)
- Groups by category, sorted by article count
- Generates formatted Markdown with:
  - Week range header
  - Category sections with article count
  - Per article: title (linked), date, source, summary
- Scheduled: Monday 9AM (cron in n8n) or manual trigger

### 3. Vector Store Indexing

**File:** `src/workflows/03-vector-indexing.json`
**Node.js:** `npm run index` (`src/services/vectorIndexing.js`)

- Reads unindexed articles (`indexed_at IS NULL`)
- Sentence-aware chunking (500 chars, 50 char overlap)
- Prepends article title to each chunk for context
- Generates embeddings via OpenAI `text-embedding-3-small`
- Upserts to Qdrant with metadata: `article_id, source, category, published_at, url`
- Marks articles as indexed after successful processing
- Batch embedding (20 chunks at a time) for efficiency

### 4. RAG Chat Agent

**File:** `src/workflows/04-rag-chat-agent.json`
**Node.js:** `npm run chat` (`src/services/ragChat.js`)

- Interactive CLI chat or n8n Chat Trigger
- Embeds user question -> searches Qdrant for relevant chunks
- **Hybrid search:** vector similarity + SQL keyword fallback for low-result queries
- Deduplicates sources by `article_id`
- System prompt enforces grounded answers with mandatory source citations
- Returns markdown-formatted answers with `[Title](URL)` links

### 5. Full Pipeline (Webhook)

**File:** `src/workflows/05-pipeline.json`
**API:** `POST /api/pipeline` (`src/features/pipeline/http.js`)

- Single webhook that runs the entire pipeline: ingest -> index -> digest
- Accepts parameters: `topicSlug`, `range` (e.g. `1w`, `2w`, `1d`), `feeds` (array of URLs)
- Normalizes RSS items, deduplicates, inserts into PostgreSQL
- Generates digest for the requested topic/range
- Used by the frontend "Refresh Data" button and the daily GitHub Actions cron job

## Database Schema

```sql
CREATE TABLE articles (
  id              SERIAL PRIMARY KEY,
  title           TEXT        NOT NULL,
  url             TEXT        NOT NULL UNIQUE,
  source          TEXT        NOT NULL,
  published_at    TIMESTAMPTZ,
  category        TEXT        DEFAULT 'general',
  summary         TEXT,
  content         TEXT,
  ingested_at     TIMESTAMPTZ DEFAULT NOW(),
  indexed_at      TIMESTAMPTZ
);

CREATE TABLE workflow_errors (
  id          SERIAL PRIMARY KEY,
  workflow    TEXT        NOT NULL,
  error_msg   TEXT,
  context     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Key indexes: `published_at DESC` (digest queries), `url` (dedup), `category` (grouping).

## n8n Workflow Import

1. Open n8n at `http://localhost:5678`
2. Go to **Workflows -> Import from File**
3. Import each JSON from `src/workflows/`:
   - `01-rss-to-database.json`
   - `02-weekly-digest.json`
   - `03-vector-indexing.json`
   - `04-rag-chat-agent.json`
   - `05-pipeline.json`
4. Configure credentials in n8n:
   - **PostgreSQL:** host=`postgres`, port=`5432`, db=`ai_news_digest`
   - **OpenAI:** your API key
   - **Qdrant:** url=`http://qdrant:6333`

   Note: Use Docker service names (`postgres`, `qdrant`) when configuring credentials inside n8n, since n8n runs in the same Docker network.

For a step-by-step walkthrough, see **[docs/N8N-QUICKSTART.md](docs/N8N-QUICKSTART.md)**.

## Example Outputs

- **Sample DB records:** `examples/sample-db-records.json`
- **Weekly digest:** `examples/weekly-digest-sample.md`
- **Chat transcript:** `examples/chat-transcript-sample.md`

## Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **PostgreSQL** for articles | First-class n8n support, strong indexing, `ON CONFLICT` for dedup |
| **Qdrant** for vectors | Clean REST API, excellent n8n integration, easy Docker setup, free |
| **text-embedding-3-small** | Best price/quality ratio for news content (1536 dims, $0.02/1M tokens) |
| **gpt-4o-mini** for chat | Fast and cheap for RAG answers; swap to `gpt-4o` for higher quality |
| **Sentence-based chunking** | Preserves semantic coherence vs. character-level splitting |
| **Title prepended to chunks** | Improves embedding quality -- model knows the article context |
| **Hybrid search** | Vector search alone misses exact names/acronyms; keyword fallback improves recall |
| **`indexed_at` tracking** | Enables incremental indexing -- only process new articles |

## Beyond the Requirements

These additions demonstrate production-readiness thinking:

| Enhancement | What it does | Why it matters |
|-------------|-------------|----------------|
| **Idempotent ingestion** | `ON CONFLICT (url) DO NOTHING` prevents duplicates | Real RSS feeds are polled repeatedly; without dedup, data quality degrades |
| **Error logging** | `workflow_errors` table captures failures with context | Enables debugging without digging through logs; shows ops awareness |
| **Configurable sources** | RSS URLs from `.env`, not hardcoded | Adding/removing feeds is a config change, not a code change |
| **Hybrid search** | Vector + SQL `ILIKE` fallback when vector results are sparse | Pure vector search struggles with exact names, acronyms, new terms |
| **Incremental indexing** | `indexed_at` column tracks which articles have been vectorized | Avoids re-embedding already-indexed content; saves API costs |
| **LLM summary enrichment** | Generates summaries when RSS doesn't provide one | Ensures consistent digest quality regardless of feed format |
| **Structured error handling** | Try/catch per feed and per article, not all-or-nothing | One bad feed or article doesn't kill the entire pipeline |

## Future Enhancements

Ideas for extending this system beyond the current scope:

- **Full-text article fetching** -- RSS often provides only snippets. An HTTP Request node could fetch the full article content from the URL for richer embeddings.
- **LLM-based category classification** -- Use an LLM to assign consistent categories instead of relying on inconsistent RSS metadata.
- **Digest delivery via Slack/Email** -- Add a branch to the digest workflow that sends the Markdown to a Slack channel or email address.
- **Analytics dashboard** -- Track most-asked questions, retrieval hit rates, and token usage over time.
- **Multi-language support** -- Add language detection to handle non-English sources, with translated summaries.
- **Chunk quality scoring** -- Score and filter low-quality chunks before indexing to improve RAG precision.
- **Conversation memory** -- Extend the RAG agent to maintain chat history for follow-up questions.

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 18+ | Application logic |
| Frontend | React + Vite | Browser UI (Chat, Digest) |
| Workflows | n8n | Visual workflow automation |
| Database | PostgreSQL 16 (pgvector) | Article storage + metadata |
| Vector Store | Qdrant v1.12 | Semantic search |
| Embeddings | OpenAI text-embedding-3-small | Text -> vector conversion |
| LLM | OpenAI gpt-4o-mini | Chat answers + summary generation |
| Infrastructure | Docker Compose | One-command setup |
| CI/CD | GitHub Actions -> Railway | Auto-deploy on push to `n8n` branch |

## Project Structure

```
ai-news-digest/
├── docker-compose.yml          # Infrastructure (Postgres, Qdrant, n8n, App)
├── Dockerfile                  # Production image (API + built frontend)
├── railway.json                # Railway deployment config
├── .env.example                # Environment configuration template
├── package.json                # Dependencies and scripts
├── README.md                   # This file
├── .github/workflows/
│   ├── n8n-railway.yml         # CI: Test -> Docker -> Railway deploy
│   └── rag-pipeline.yml        # Scheduled: daily pipeline trigger
├── src/
│   ├── server.js               # App entrypoint (Express + migrations)
│   ├── app/createApp.js        # Express app factory + routes
│   ├── config/index.js         # Centralized configuration
│   ├── features/
│   │   ├── chat/               # RAG chat: API handler, answer logic, hybrid search
│   │   ├── digest/             # Digest: API handler, title formatting
│   │   ├── pipeline/           # Full pipeline: API handler (ingest+index+digest)
│   │   └── topics/             # Topic management: CRUD, RSS sources
│   ├── migrations/
│   │   ├── 001_create_articles.sql
│   │   └── run.js              # Migration runner
│   ├── services/
│   │   ├── rssIngestion.js     # RSS -> Database pipeline
│   │   ├── vectorIndexing.js   # Database -> Qdrant pipeline
│   │   ├── weeklyDigest.js     # Markdown digest generator
│   │   └── ragChat.js          # RAG chat facade (CLI + API)
│   ├── utils/
│   │   ├── db.js               # PostgreSQL connection pool
│   │   ├── openai.js           # OpenAI embeddings + chat
│   │   ├── qdrant.js           # Qdrant vector operations
│   │   ├── chunker.js          # Text chunking with overlap
│   │   └── logger.js           # Error logging + console output
│   └── workflows/
│       ├── 01-rss-to-database.json     # n8n: RSS ingestion
│       ├── 02-weekly-digest.json       # n8n: Weekly digest
│       ├── 03-vector-indexing.json     # n8n: Vector indexing
│       ├── 04-rag-chat-agent.json      # n8n: RAG chat
│       └── 05-pipeline.json            # n8n: Full pipeline (webhook)
├── frontend/
│   ├── src/                    # React app (Chat + Digest UI)
│   └── vite.config.js          # Vite config with /api proxy
├── scripts/
│   ├── setup.js                # Initial setup (migrations + Qdrant)
│   └── demo.js                 # Full pipeline demo
├── examples/
│   ├── sample-db-records.json  # Example database records
│   ├── weekly-digest-sample.md # Example digest output
│   └── chat-transcript-sample.md  # Example chat session
├── docs/
│   ├── N8N-QUICKSTART.md       # n8n workflow import guide
│   ├── USER-GUIDE.md           # UI user guide
│   ├── railway-n8n-setup.md    # Railway deployment setup
│   └── n8n-production-database.md  # n8n DB troubleshooting
└── outputs/                    # Generated digests land here
```

## License

MIT
