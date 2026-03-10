-- ============================================================
-- Migration 001: Create articles table
-- AI News Digest + RAG Agent
-- ============================================================

CREATE TABLE IF NOT EXISTS articles (
  id              SERIAL PRIMARY KEY,
  title           TEXT        NOT NULL,
  url             TEXT        NOT NULL UNIQUE,     -- dedup key
  source          TEXT        NOT NULL,            -- e.g. "TechCrunch", "Ars Technica"
  published_at    TIMESTAMPTZ,
  category        TEXT        DEFAULT 'general',
  summary         TEXT,
  content         TEXT,
  ingested_at     TIMESTAMPTZ DEFAULT NOW(),       -- 1.2: track when we first saw this
  indexed_at      TIMESTAMPTZ                      -- 1.2: track when vectorized
);

-- Index for weekly digest queries (last N days)
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles (url);

-- Index for grouping by category
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);

-- ============================================================
-- Migration 001b: Error log table (1.2 improvement)
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_errors (
  id          SERIAL PRIMARY KEY,
  workflow    TEXT        NOT NULL,
  error_msg   TEXT,
  context     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
