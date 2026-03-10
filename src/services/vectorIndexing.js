/**
 * Vector Store + Indexing Service
 *
 * Reads articles from PostgreSQL, chunks their content,
 * generates embeddings, and upserts into Qdrant with metadata.
 *
 * Run: node src/services/vectorIndexing.js
 */
import config from "../config/index.js";
import { query, closePool } from "../utils/db.js";
import { embedTexts } from "../utils/openai.js";
import { ensureCollection, upsertPoints } from "../utils/qdrant.js";
import { chunkText } from "../utils/chunker.js";
import { logError, log } from "../utils/logger.js";

const BATCH_SIZE = 20; // embed up to 20 chunks at a time

// ─── Main indexing logic ─────────────────────────────────────
export async function runIndexing() {
  log("VEC", "═══ Starting Vector Indexing ═══");

  // Ensure Qdrant collection exists
  await ensureCollection();

  // Fetch articles that haven't been indexed yet
  const result = await query(
    `SELECT id, title, url, source, category, published_at, summary, content
     FROM articles
     WHERE indexed_at IS NULL
     ORDER BY published_at DESC`
  );

  const articles = result.rows;
  log("VEC", `  Found ${articles.length} articles to index.`);

  if (articles.length === 0) {
    log("VEC", "  Nothing to index. Done.");
    return { indexed: 0, chunks: 0 };
  }

  let totalChunks = 0;
  let totalIndexed = 0;

  for (const article of articles) {
    try {
      // Use content if available, fall back to summary
      const textToChunk = article.content || article.summary || "";
      if (textToChunk.length < 50) {
        log("VEC", `  ⚠ Skipping article ${article.id} — insufficient content.`);
        // Mark as indexed to avoid re-processing
        await query(`UPDATE articles SET indexed_at = NOW() WHERE id = $1`, [article.id]);
        continue;
      }

      // Chunk the text
      const chunks = chunkText(textToChunk);
      log("VEC", `  ▸ Article ${article.id}: "${article.title.slice(0, 60)}..." → ${chunks.length} chunks`);

      // Prepare texts for embedding with context prefix
      const textsForEmbedding = chunks.map(
        (chunk, i) => `${article.title}\n\n${chunk}`
      );

      // Batch embed
      for (let i = 0; i < textsForEmbedding.length; i += BATCH_SIZE) {
        const batch = textsForEmbedding.slice(i, i + BATCH_SIZE);
        const chunkBatch = chunks.slice(i, i + BATCH_SIZE);
        const vectors = await embedTexts(batch);

        // Build points for Qdrant
        const points = vectors.map((vector, j) => {
          const globalIdx = i + j;
          // Use article_id * 10000 + chunk_index as point ID
          const pointId = article.id * 10000 + globalIdx;

          return {
            id: pointId,
            vector,
            payload: {
              article_id: article.id,
              chunk_index: globalIdx,
              chunk_text: chunkBatch[j],
              title: article.title,
              source: article.source,
              category: article.category,
              published_at: article.published_at
                ? new Date(article.published_at).toISOString()
                : null,
              url: article.url,
            },
          };
        });

        await upsertPoints(points);
        totalChunks += points.length;
      }

      // Mark article as indexed
      await query(`UPDATE articles SET indexed_at = NOW() WHERE id = $1`, [article.id]);
      totalIndexed++;
    } catch (err) {
      await logError("vector-indexing", `Failed to index article ${article.id}: ${err.message}`, {
        articleId: article.id,
        title: article.title,
      });
      log("VEC", `  ✗ Failed article ${article.id}: ${err.message}`);
    }
  }

  log("VEC", "═══ Indexing Complete ═══");
  log("VEC", `  Articles indexed: ${totalIndexed} | Total chunks: ${totalChunks}`);

  return { indexed: totalIndexed, chunks: totalChunks };
}

// Run directly
const isMain = process.argv[1] && process.argv[1].includes("vectorIndexing");
if (isMain) {
  runIndexing()
    .then(() => closePool())
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
