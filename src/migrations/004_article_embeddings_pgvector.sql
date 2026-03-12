-- ============================================================
-- Migration 004: pgvector + article_embeddings (n8n vector indexing)
-- AI News Digest — PostgreSQL vectorizer only (no Qdrant)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS article_embeddings (
  id             BIGSERIAL PRIMARY KEY,
  article_id     INT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  chunk_index    INT NOT NULL,
  embedding      vector(1536) NOT NULL,
  chunk_text     TEXT,
  title          TEXT,
  source         TEXT,
  category       TEXT,
  published_at   TIMESTAMPTZ,
  url            TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_embeddings_embedding
  ON article_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_article_embeddings_article_id
  ON article_embeddings (article_id);
