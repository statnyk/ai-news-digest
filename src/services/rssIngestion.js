/**
 * RSS → Database Ingestion Service
 *
 * Fetches articles from configured RSS feeds, normalizes them into
 * a consistent record, deduplicates by URL, and persists to PostgreSQL.
 *
 * Run: node src/services/rssIngestion.js
 * n8n: triggered via Execute Command node or HTTP webhook
 */
import Parser from "rss-parser";
import config from "../config/index.js";
import { query, closePool } from "../utils/db.js";
import { chatCompletion } from "../utils/openai.js";
import { logError, log } from "../utils/logger.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "AI-News-Digest/1.0",
  },
});

// ─── Source name extraction ──────────────────────────────────
const SOURCE_MAP = {
  "techcrunch.com": "TechCrunch",
  "arstechnica.com": "Ars Technica",
  "theverge.com": "The Verge",
  "technologyreview.com": "MIT Technology Review",
  "venturebeat.com": "VentureBeat",
};

function extractSourceName(feedUrl, feedTitle) {
  for (const [domain, name] of Object.entries(SOURCE_MAP)) {
    if (feedUrl.includes(domain)) return name;
  }
  return feedTitle || new URL(feedUrl).hostname;
}

// ─── Category extraction / classification ────────────────────
function extractCategory(item) {
  // Try RSS categories first
  if (item.categories && item.categories.length > 0) {
    const cat = typeof item.categories[0] === "string"
      ? item.categories[0]
      : item.categories[0].name || item.categories[0]._ || "general";
    return cat.toLowerCase().trim();
  }
  return "ai"; // default for AI-focused feeds
}

// ─── Normalize a single RSS item ─────────────────────────────
function normalizeItem(item, feedUrl, feedTitle) {
  const source = extractSourceName(feedUrl, feedTitle);
  const category = extractCategory(item);

  // Extract content: prefer content:encoded > content > contentSnippet
  const content = (
    item["content:encoded"] ||
    item.content ||
    item.contentSnippet ||
    item.summary ||
    ""
  )
    .replace(/<[^>]*>/g, " ")     // strip HTML
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim();

  const summary = (item.contentSnippet || item.summary || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  return {
    title: (item.title || "Untitled").trim(),
    url: (item.link || item.guid || "").trim(),
    source,
    published_at: item.isoDate || item.pubDate || new Date().toISOString(),
    category,
    summary: summary || null,
    content: content || null,
  };
}

// ─── Generate summary via LLM if missing ─────────────────────
async function enrichSummary(article) {
  if (article.summary && article.summary.length > 50) return article;
  if (!article.content || article.content.length < 100) return article;

  try {
    const generated = await chatCompletion(
      "You are a concise news summarizer. Summarize the following article in 1-2 sentences. Output only the summary, nothing else.",
      article.content.slice(0, 3000)
    );
    article.summary = generated.trim();
  } catch (err) {
    log("RSS", `  ⚠ LLM summary failed for "${article.title}": ${err.message}`);
  }
  return article;
}

// ─── Main ingestion logic ────────────────────────────────────
async function ingestFeed(feedUrl) {
  log("RSS", `Fetching feed: ${feedUrl}`);

  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (err) {
    await logError("rss-ingestion", `Failed to fetch feed: ${err.message}`, { feedUrl });
    log("RSS", `  ✗ Failed to fetch: ${err.message}`);
    return { fetched: 0, inserted: 0, skipped: 0, errors: 1 };
  }

  log("RSS", `  Found ${feed.items.length} items from "${feed.title}"`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of feed.items) {
    let article = normalizeItem(item, feedUrl, feed.title);

    if (!article.url) {
      log("RSS", `  ⚠ Skipping item without URL: "${article.title}"`);
      skipped++;
      continue;
    }

    // Enrich summary if needed
    article = await enrichSummary(article);

    try {
      const result = await query(
        `INSERT INTO articles (title, url, source, published_at, category, summary, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
        [
          article.title,
          article.url,
          article.source,
          article.published_at,
          article.category,
          article.summary,
          article.content,
        ]
      );

      if (result.rowCount > 0) {
        inserted++;
        log("RSS", `  ✓ Inserted: "${article.title}" (id: ${result.rows[0].id})`);
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      await logError("rss-ingestion", `Insert failed: ${err.message}`, {
        url: article.url,
        title: article.title,
      });
      log("RSS", `  ✗ Insert failed for "${article.title}": ${err.message}`);
    }
  }

  return { fetched: feed.items.length, inserted, skipped, errors };
}

// ─── Entry point ─────────────────────────────────────────────
export async function runIngestion() {
  log("RSS", "═══ Starting RSS Ingestion ═══");

  const feeds = config.rss.feeds;
  if (feeds.length === 0) {
    log("RSS", "No RSS feeds configured. Set RSS_FEEDS in .env");
    return;
  }

  const stats = { totalFetched: 0, totalInserted: 0, totalSkipped: 0, totalErrors: 0 };

  for (const feedUrl of feeds) {
    const result = await ingestFeed(feedUrl);
    stats.totalFetched += result.fetched;
    stats.totalInserted += result.inserted;
    stats.totalSkipped += result.skipped;
    stats.totalErrors += result.errors;
  }

  log("RSS", "═══ Ingestion Complete ═══");
  log("RSS", `  Fetched: ${stats.totalFetched} | Inserted: ${stats.totalInserted} | Skipped: ${stats.totalSkipped} | Errors: ${stats.totalErrors}`);

  return stats;
}

// Run directly
const isMain = process.argv[1] && process.argv[1].includes("rssIngestion");
if (isMain) {
  runIngestion()
    .then(() => closePool())
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
