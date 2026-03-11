-- ============================================================
-- Migration 002: Topic folders + user RSS sources
-- ============================================================

CREATE TABLE IF NOT EXISTS topics (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_sources (
  id          SERIAL PRIMARY KEY,
  topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  rss_url     TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, rss_url)
);

CREATE TABLE IF NOT EXISTS article_topics (
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(article_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_sources_topic_id ON topic_sources(topic_id);
CREATE INDEX IF NOT EXISTS idx_article_topics_topic_id ON article_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_article_topics_article_id ON article_topics(article_id);
