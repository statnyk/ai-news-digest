/**
 * Weekly Digest Generator
 *
 * Queries the last N days of articles from PostgreSQL,
 * groups them by category, and generates a Markdown digest.
 *
 * Run: node src/services/weeklyDigest.js
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import config from "../config/index.js";
import { query, closePool } from "../utils/db.js";
import { log } from "../utils/logger.js";

// ─── Date helpers ────────────────────────────────────────────
function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Markdown generation ─────────────────────────────────────
function generateMarkdown(articles, startDate, endDate, titleSuffix = "") {
  const lines = [];

  // Header
  lines.push(`# 📰 AI News Weekly Digest${titleSuffix ? ` — ${titleSuffix}` : ""}`);
  lines.push(``);
  lines.push(`**${formatDate(startDate)} — ${formatDate(endDate)}**`);
  lines.push(``);
  lines.push(`> ${articles.length} articles from ${new Set(articles.map((a) => a.source)).size} sources`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Group by category
  const grouped = {};
  for (const article of articles) {
    const cat = article.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(article);
  }

  // Sort categories by article count (most articles first)
  const sortedCategories = Object.entries(grouped).sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [category, catArticles] of sortedCategories) {
    const displayCat = category.charAt(0).toUpperCase() + category.slice(1);
    lines.push(`## ${displayCat} (${catArticles.length})`);
    lines.push(``);

    // Sort by published date descending within each category
    catArticles.sort(
      (a, b) => new Date(b.published_at) - new Date(a.published_at)
    );

    for (const article of catArticles) {
      const date = article.published_at
        ? formatDateShort(article.published_at)
        : "Date N/A";
      const summary = article.summary
        ? article.summary.slice(0, 200) + (article.summary.length > 200 ? "..." : "")
        : "_No summary available._";

      lines.push(`### [${article.title}](${article.url})`);
      lines.push(``);
      lines.push(`📅 ${date} · 📡 ${article.source}`);
      lines.push(``);
      lines.push(`${summary}`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  // Footer
  lines.push(`_Generated on ${formatDate(new Date())} by AI News Digest._`);

  return lines.join("\n");
}

// ─── Main digest logic ───────────────────────────────────────
async function resolveTopic(topicSlug) {
  if (!topicSlug) return null;
  const result = await query(
    `SELECT id, name, slug FROM topics WHERE slug = $1 LIMIT 1`,
    [topicSlug]
  );
  return result.rows[0] || null;
}

export async function runDigest(options = {}) {
  log("DIGEST", "═══ Generating Weekly Digest ═══");

  const days = config.digest.days;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const topicSlug = options.topicSlug || null;
  const topic = await resolveTopic(topicSlug);

  log("DIGEST", `  Date range: ${formatDateShort(startDate)} → ${formatDateShort(endDate)}`);

  if (topicSlug && !topic) {
    throw new Error("Topic not found.");
  }

  const result = topic
    ? await query(
        `SELECT a.id, a.title, a.url, a.source, a.published_at, a.category, a.summary
         FROM articles a
         INNER JOIN article_topics at ON at.article_id = a.id
         WHERE a.published_at >= $1 AND at.topic_id = $2
         ORDER BY a.published_at DESC`,
        [startDate.toISOString(), topic.id]
      )
    : await query(
        `SELECT id, title, url, source, published_at, category, summary
         FROM articles
         WHERE published_at >= $1
         ORDER BY published_at DESC`,
        [startDate.toISOString()]
      );

  const articles = result.rows;
  log("DIGEST", `  Found ${articles.length} articles in the last ${days} days.`);

  if (articles.length === 0) {
    log("DIGEST", "  No articles found. Generating empty digest.");
  }

  // Generate markdown
  const markdown = generateMarkdown(articles, startDate, endDate, topic?.name || "");

  // Write to file
  const outputDir = resolve(config.digest.outputDir);
  mkdirSync(outputDir, { recursive: true });

  const dateStr = endDate.toISOString().slice(0, 10);
  const digestPrefix = topic ? `weekly-digest-${topic.slug}` : "weekly-digest";
  const outputPath = resolve(outputDir, `${digestPrefix}-${dateStr}.md`);
  writeFileSync(outputPath, markdown, "utf-8");

  log("DIGEST", `  ✓ Digest written to: ${outputPath}`);
  log("DIGEST", "═══ Digest Complete ═══");

  return { articleCount: articles.length, outputPath, markdown };
}

// Run directly
const isMain = process.argv[1] && process.argv[1].includes("weeklyDigest");
if (isMain) {
  runDigest()
    .then(({ markdown }) => {
      console.log("\n" + "═".repeat(60));
      console.log(markdown);
      return closePool();
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
