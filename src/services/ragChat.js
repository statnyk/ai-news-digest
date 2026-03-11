/**
 * RAG Chat Agent
 *
 * Interactive CLI chat that:
 *   1. Embeds user question
 *   2. Retrieves relevant chunks from Qdrant
 *   3. Generates a grounded answer via LLM with source citations
 *
 * Run: node src/services/ragChat.js
 * n8n: triggered via Chat Trigger node
 */
import { createInterface } from "readline";
import config from "../config/index.js";
import { query, closePool } from "../utils/db.js";
import { embedText, chatCompletion } from "../utils/openai.js";
import { searchSimilar } from "../utils/qdrant.js";
import { log } from "../utils/logger.js";

// ─── System prompt for the RAG agent ─────────────────────────
const SYSTEM_PROMPT = `You are an AI News Research Assistant. Your role is to answer questions about recent AI and technology news based ONLY on the provided context.

RULES:
1. ONLY use information from the provided context to answer questions.
2. If the context doesn't contain enough information, say so clearly.
3. ALWAYS cite your sources using the article URLs provided in the context.
4. Format citations as markdown links: [Article Title](URL)
5. Be concise but thorough. Summarize key points from multiple sources when relevant.
6. If asked about topics not covered in the context, say "I don't have information about that in my current news database."
7. Include the date of the article when relevant to give the user a sense of recency.`;

// ─── Build context from retrieved chunks ─────────────────────
function buildContext(chunks) {
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

// ─── Hybrid search: vector + keyword fallback (1.2 feature) ──
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

async function hybridSearch(questionVector, questionText, topicSlug = null) {
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
  let filteredVectorResults = allowedIds
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

// ─── Answer a single question ────────────────────────────────
export async function answerQuestion(question, options = {}) {
  log("RAG", `Question: "${question}"`);
  const topicSlug = options.topicSlug || null;

  // 1. Embed the question
  const questionVector = await embedText(question);

  // 2. Hybrid search: vector + keyword fallback
  const chunks = await hybridSearch(questionVector, question, topicSlug);
  log("RAG", `  Retrieved ${chunks.length} relevant chunks.`);

  // 3. Build context
  const context = buildContext(chunks);

  // 4. Generate grounded answer
  const userPrompt = `Context (retrieved articles):
${context}

---

User Question: ${question}

Please answer based on the context above. Include source citations with URLs.`;

  const answer = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
    maxTokens: 2000,
    temperature: 0.2,
  });

  return {
    question,
    answer,
    sources: chunks.map((c) => ({
      title: c.payload.title,
      url: c.payload.url,
      source: c.payload.source,
      score: c.score,
    })),
  };
}

// ─── Interactive CLI chat ────────────────────────────────────
async function interactiveChat() {
  console.log("═".repeat(60));
  console.log("  🤖 AI News Digest — RAG Chat Agent");
  console.log("  Ask questions about recent AI/tech news.");
  console.log("  Type 'quit' or 'exit' to stop.");
  console.log("═".repeat(60));
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed === "quit" || trimmed === "exit") {
        console.log("\nGoodbye! 👋");
        rl.close();
        await closePool();
        return;
      }

      try {
        const result = await answerQuestion(trimmed);
        console.log(`\nAssistant: ${result.answer}`);
        console.log(
          `\n  📚 Sources used: ${result.sources.map((s) => s.source).join(", ")}`
        );
        console.log();
      } catch (err) {
        console.error(`\n  ✗ Error: ${err.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// ─── Programmatic API for n8n integration ────────────────────
export async function handleChatRequest(body) {
  const question = body.message || body.question || body.text || "";
  if (!question) {
    return { error: "No question provided." };
  }
  return answerQuestion(question, { topicSlug: body.topicSlug || null });
}

// Run directly
const isMain = process.argv[1] && process.argv[1].includes("ragChat");
if (isMain) {
  interactiveChat();
}
