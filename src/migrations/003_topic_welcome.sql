-- ============================================================
-- Migration 003: Topic welcome content (title + description)
-- ============================================================

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS welcome_title TEXT,
  ADD COLUMN IF NOT EXISTS welcome_description TEXT;
