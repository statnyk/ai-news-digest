import { resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

import config from "../../config/index.js";
import { runDigest } from "../../services/weeklyDigest.js";
import { runIngestion } from "../../services/rssIngestion.js";
import { listTopicSources } from "../../services/topics.js";
import { query } from "../../utils/db.js";
import { log } from "../../utils/logger.js";
import { isN8nEnabled, forwardToN8n } from "../../utils/n8nWebhook.js";
import { formatDigestTitle } from "./formatDigestTitle.js";

function getLatestDigest(topicSlug = null, range = "1w") {
  const outputDir = resolve(config.digest.outputDir);
  const normalizedRange = typeof range === "string" ? range.trim().toLowerCase() : "1w";
  const topicPattern = topicSlug
    ? new RegExp(`^weekly-digest-${topicSlug}-${normalizedRange}-\\d{4}-\\d{2}-\\d{2}\\.md$`)
    : new RegExp(`^weekly-digest-${normalizedRange}-\\d{4}-\\d{2}-\\d{2}\\.md$`);
  try {
    const files = readdirSync(outputDir)
      .filter((f) => topicPattern.test(f))
      .sort((a, b) => b.localeCompare(a));

    if (files.length > 0) {
      const markdown = readFileSync(resolve(outputDir, files[0]), "utf-8");
      return { articleCount: null, markdown, file: files[0] };
    }
  } catch {
    // outputDir may not exist yet
  }
  return null;
}

export function registerDigestRoutes(app) {
  app.get("/api/digest", async (req, res) => {
    try {
      const topicSlug = req.query.topic ? String(req.query.topic) : null;
      const range = req.query.range ? String(req.query.range) : "1w";

      // Topic digest: always run ingestion then Node digest (same DB). Works with or without n8n.
      if (topicSlug) {
        const sourceList = await listTopicSources(topicSlug);
        if (sourceList.error) {
          return res.status(400).json({ error: sourceList.error });
        }
        const activeFeeds = (sourceList.sources || []).filter((s) => s.active !== false);
        if (activeFeeds.length === 0) {
          return res.status(400).json({
            error: "No RSS feeds for this topic. Add sources in the topic settings (click the topic name).",
          });
        }
        let stats;
        try {
          stats = await runIngestion({ topicSlug });
        } catch (err) {
          log("API", `Topic ingestion before digest: ${err.message}`);
          return res.status(400).json({
            error: err.message === "Topic not found." ? "Topic not found." : `Ingestion failed: ${err.message}`,
          });
        }
        if (stats.totalFetched === 0) {
          return res.status(400).json({
            error: "RSS feeds returned no items. Check that the feed URL is valid and returns entries (try opening it in a browser).",
          });
        }
        const linked = await query(
          `SELECT COUNT(*)::int AS c FROM article_topics at
           INNER JOIN topics t ON t.id = at.topic_id WHERE t.slug = $1`,
          [topicSlug]
        );
        const linkedCount = linked.rows[0]?.c ?? 0;
        if (linkedCount === 0) {
          log("API", `Topic ${topicSlug}: ingestion fetched ${stats.totalFetched} but 0 linked to topic. Check server logs for insert errors.`);
          return res.status(400).json({
            error: "Articles were fetched but none could be linked to this topic. Check server logs for RSS or database errors.",
          });
        }
        const result = await runDigest({ topicSlug, range });
        const markdown = await formatDigestTitle(result.markdown, topicSlug, range);
        return res.json({
          articleCount: result.articleCount,
          markdown,
        });
      }

      if (isN8nEnabled()) {
        const data = await forwardToN8n("digest", { topic: topicSlug, topicSlug, range });
        const payload = Array.isArray(data) && data[0]?.json != null
          ? data[0].json
          : (data?.json ?? data);
        let markdown = payload?.markdown || payload?.output || payload?.text || JSON.stringify(payload);
        markdown = await formatDigestTitle(markdown, topicSlug, range);
        return res.json({
          articleCount: payload?.articleCount ?? null,
          markdown,
        });
      }

      const generate = req.query.generate === "true";
      if (generate) {
        const result = await runDigest({ topicSlug, range });
        return res.json({
          articleCount: result.articleCount,
          markdown: result.markdown,
        });
      }

      const cached = getLatestDigest(topicSlug, range);
      if (cached) {
        return res.json(cached);
      }

      const result = await runDigest({ topicSlug, range });
      res.json({
        articleCount: result.articleCount,
        markdown: result.markdown,
      });
    } catch (err) {
      log("API", `Digest error: ${err.message}`);
      res.status(500).json({ error: "Failed to generate digest." });
    }
  });
}
