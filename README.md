# AI News Digest + RAG Agent

An end-to-end system that ingests AI/tech news from RSS feeds, persists articles to PostgreSQL, generates weekly Markdown digests, indexes content into a Qdrant vector store, and exposes a RAG-powered chat agent that answers questions with cited sources.

Built with **Node.js** + **n8n** workflows.

## Live app

- **Production:** [https://ai-news-digest-production.up.railway.app/](https://ai-news-digest-production.up.railway.app/)
- **User guide:** See [docs/USER-GUIDE.md](docs/USER-GUIDE.md) for how the app works and how to use the UI.

### Custom domain (Railway)

To use your own URL (e.g. `news.yourdomain.com`):

1. In [Railway](https://railway.app) open your project → the service → **Settings** → **Networking** → **Public Networking**.
2. Under **Custom Domains**, click **Add custom domain** and enter your domain (e.g. `news.yourdomain.com`).
3. Railway will show a target host (e.g. `ai-news-digest-production.up.railway.app`). In your DNS provider, add a **CNAME** record:
   - **Name:** subdomain you want (e.g. `news` for `news.yourdomain.com`)
   - **Value / Target:** the Railway host from step 2
4. Wait for DNS to propagate; Railway will issue an SSL certificate automatically.

For root domains (`yourdomain.com`) your DNS must support CNAME flattening or ALIAS. See [Railway’s Public Networking guide](https://docs.railway.app/guides/public-networking) for details.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data Flow                                 │
│                                                                   │
│  RSS Feeds ──▶ n8n / Node.js ──▶ PostgreSQL                     │
│  (TechCrunch,    (Normalize,       (articles table)              │
│   Ars Technica,   Dedup,                │                        │
│   The Verge)      Enrich)               │                        │
│                                         ├───▶ Weekly Digest      │
│                                         │     (Markdown file)    │
│                                         │                        │
│                                         ▼                        │
│                                  Chunking + Embeddings           │
│                                  (OpenAI text-embedding-3-small) │
│                                         │                        │
│                                         ▼                        │
│                                  Qdrant Vector Store             │
│                                         │                        │
│                                         ▼                        │
│                                  RAG Chat Agent                  │
│                                  (n8n Chat / CLI)                │
│                                  ▸ Retrieve chunks               │
│                                  ▸ Generate grounded answer      │
│                                  ▸ Cite source URLs              │
└─────────────────────────────────────────────────────────────────┘
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
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY
```

### 3. Start Infrastructure

```bash
docker-compose up -d
# Starts: PostgreSQL (port 5432), Qdrant (port 6333), n8n (port 5678)
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
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `OPENAI_EMBEDDING_MODEL` | | `text-embedding-3-small` | Embedding model |
| `OPENAI_CHAT_MODEL` | | `gpt-4o-mini` | LLM for chat + summaries |
| `RSS_FEEDS` | | 3 defaults | Comma-separated RSS URLs |
| `DIGEST_OUTPUT_DIR` | | `./outputs` | Where digests are saved |
| `DIGEST_DAYS` | | `7` | Days to cover in digest |
| `RAG_TOP_K` | | `5` | Chunks retrieved per query |
| `RAG_SIMILARITY_THRESHOLD` | | `0.7` | Minimum similarity score |
| `CHUNK_SIZE` | | `500` | Characters per chunk |
| `CHUNK_OVERLAP` | | `50` | Overlap between chunks |

## Workflows

### 1. RSS → Database Ingestion

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

- Queries articles from last 7 days
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
- Embeds user question → searches Qdrant for relevant chunks
- **Hybrid search:** vector similarity + SQL keyword fallback for low-result queries
- Deduplicates sources by `article_id`
- System prompt enforces grounded answers with mandatory source citations
- Returns markdown-formatted answers with `[Title](URL)` links

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
2. Go to **Workflows → Import from File**
3. Import each JSON from `src/workflows/`:
   - `01-rss-to-database.json`
   - `02-weekly-digest.json`
   - `03-vector-indexing.json`
   - `04-rag-chat-agent.json`
4. Configure credentials in n8n:
   - **PostgreSQL:** host=`postgres`, port=`5432`, db=`ai_news_digest`
   - **OpenAI:** your API key
   - **Qdrant:** url=`http://qdrant:6333`
   
   Note: Use Docker service names (`postgres`, `qdrant`) when configuring credentials inside n8n, since n8n runs in the same Docker network.

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
| **Title prepended to chunks** | Improves embedding quality — model knows the article context |
| **Hybrid search** | Vector search alone misses exact names/acronyms; keyword fallback improves recall |
| **`indexed_at` tracking** | Enables incremental indexing — only process new articles |

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

- **Full-text article fetching** — RSS often provides only snippets. An HTTP Request node could fetch the full article content from the URL for richer embeddings.
- **LLM-based category classification** — Use an LLM to assign consistent categories instead of relying on inconsistent RSS metadata.
- **Digest delivery via Slack/Email** — Add a branch to the digest workflow that sends the Markdown to a Slack channel or email address.
- **Analytics dashboard** — Track most-asked questions, retrieval hit rates, and token usage over time.
- **Multi-language support** — Add language detection to handle non-English sources, with translated summaries.
- **Chunk quality scoring** — Score and filter low-quality chunks before indexing to improve RAG precision.
- **Conversation memory** — Extend the RAG agent to maintain chat history for follow-up questions.

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 18+ | Application logic |
| Workflows | n8n | Visual workflow automation |
| Database | PostgreSQL 16 | Article storage + metadata |
| Vector Store | Qdrant v1.12 | Semantic search |
| Embeddings | OpenAI text-embedding-3-small | Text → vector conversion |
| LLM | OpenAI gpt-4o-mini | Chat answers + summary generation |
| Infrastructure | Docker Compose | One-command setup |

## Project Structure

```
ai-news-digest/
├── docker-compose.yml          # Infrastructure (Postgres, Qdrant, n8n)
├── .env.example                # Environment configuration template
├── package.json                # Dependencies and scripts
├── README.md                   # This file
├── src/
│   ├── config/index.js         # Centralized configuration
│   ├── migrations/
│   │   ├── 001_create_articles.sql  # Database schema
│   │   └── run.js              # Migration runner
│   ├── services/
│   │   ├── rssIngestion.js     # RSS → Database pipeline
│   │   ├── vectorIndexing.js   # Database → Qdrant pipeline
│   │   ├── weeklyDigest.js     # Markdown digest generator
│   │   └── ragChat.js          # RAG chat agent (CLI + API)
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
│       └── 04-rag-chat-agent.json      # n8n: RAG chat
├── scripts/
│   ├── setup.js                # Initial setup (migrations + Qdrant)
│   └── demo.js                 # Full pipeline demo
├── examples/
│   ├── sample-db-records.json  # Example database records
│   ├── weekly-digest-sample.md # Example digest output
│   └── chat-transcript-sample.md  # Example chat session
└── outputs/                    # Generated digests land here
```

## License

MIT
