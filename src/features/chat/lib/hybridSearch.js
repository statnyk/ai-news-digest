import config from "../../../config/index.js";
import { query } from "../../../utils/db.js";
import { searchSimilar } from "../../../utils/qdrant.js";
import { log } from "../../../utils/logger.js";

async function getAllowedArticleIds(topicSlug, articleIds) {
  if (!topicSlug || articleIds.length === 0) return null;
  const result = await query(
    `SELECT at.article_id
     FROM article_topics at
     INNER JOIN topics t ON t.id = at.topic_id
     WHERE t.slug = $1 AND at.article_id = ANY($2::int[])`,
    [topicSlug, articleIds]
  );
  return new Set(result.rows.map((r) => r.article_id));
}

export async function hybridSearch(questionVector, questionText, topicSlug = null) {
  // 1. Vector search
  const vectorResults = await searchSimilar(
    questionVector,
    config.rag.topK,
    config.rag.similarityThreshold
  );

  // 2. If vector results are sparse, supplement with keyword search
  const allowedIds = await getAllowedArticleIds(
    topicSlug,
    vectorResults.map((r) => r.payload.article_id)
  );
  const filteredVectorResults = allowedIds
    ? vectorResults.filter((r) => allowedIds.has(r.payload.article_id))
    : vectorResults;

  if (filteredVectorResults.length < 3) {
    log("RAG", "  ℹ Low vector results, supplementing with keyword search...");
    // Prefer longest (most specific) terms so e.g. "youtube" is used, not just "what"/"tell"/"about"
    const keywords = questionText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);

    if (keywords.length > 0) {
      const keywordQuery = keywords.map((k) => `%${k}%`);
      const conditions = keywordQuery.map((_, i) => `(title ILIKE $${i + 1} OR content ILIKE $${i + 1} OR summary ILIKE $${i + 1})`);

      try {
        // Prefer articles matching the first (most specific) keyword, then by date
        const result = topicSlug
          ? await query(
              `SELECT a.id, a.title, a.url, a.source, a.category, a.published_at, a.summary, a.content
               FROM articles a
               INNER JOIN article_topics at ON at.article_id = a.id
               INNER JOIN topics t ON t.id = at.topic_id
               WHERE t.slug = $${keywordQuery.length + 1}
                 AND (${conditions.join(" OR ")})
               ORDER BY (a.title ILIKE $1 OR a.content ILIKE $1 OR a.summary ILIKE $1) DESC, a.published_at DESC
               LIMIT 8`,
              [...keywordQuery, topicSlug]
            )
          : await query(
              `SELECT id, title, url, source, category, published_at, summary, content
               FROM articles
               WHERE ${conditions.join(" OR ")}
               ORDER BY (title ILIKE $1 OR content ILIKE $1 OR summary ILIKE $1) DESC, published_at DESC
               LIMIT 8`,
              keywordQuery
            );

        // Convert DB results to chunk-like format for context building
        const dbChunks = result.rows.map((row) => ({
          score: 0.5, // synthetic score for keyword matches
          payload: {
            article_id: row.id,
            chunk_text: (row.content || row.summary || "").slice(0, 500),
            title: row.title,
            source: row.source,
            category: row.category,
            published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
            url: row.url,
          },
        }));

        // Merge and deduplicate
        const existingIds = new Set(filteredVectorResults.map((r) => r.payload.article_id));
        for (const chunk of dbChunks) {
          if (!existingIds.has(chunk.payload.article_id)) {
            filteredVectorResults.push(chunk);
            existingIds.add(chunk.payload.article_id);
          }
        }
      } catch {
        // Keyword search failed, continue with vector results only
      }
    }
  }

  return filteredVectorResults;
}
