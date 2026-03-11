import config from "../../../config/index.js";

export function buildContext(chunks) {
  if (chunks.length === 0) return "No relevant articles found in the database.";

  // Deduplicate by article_id to avoid repeating the same source
  const seen = new Set();
  const uniqueChunks = [];

  for (const chunk of chunks) {
    const key = chunk.payload.article_id;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueChunks.push(chunk);
    } else if (uniqueChunks.length < config.rag.topK * 2) {
      // Allow additional chunks from same article if under limit
      uniqueChunks.push(chunk);
    }
  }

  const contextParts = uniqueChunks.map((c, i) => {
    const p = c.payload;
    const date = p.published_at
      ? new Date(p.published_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Date N/A";

    return `[Source ${i + 1}]
Title: ${p.title}
Source: ${p.source}
Date: ${date}
URL: ${p.url}
Category: ${p.category}
Content: ${p.chunk_text}`;
  });

  return contextParts.join("\n\n---\n\n");
}
