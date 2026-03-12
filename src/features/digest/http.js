import { resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

import config from "../../config/index.js";
import { runDigest } from "../../services/weeklyDigest.js";
import { log } from "../../utils/logger.js";
import { isN8nEnabled, forwardToN8n } from "../../utils/n8nWebhook.js";

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

      if (isN8nEnabled()) {
        const data = await forwardToN8n("digest", { topic: topicSlug, range });
        return res.json({
          articleCount: data.articleCount ?? null,
          markdown: data.markdown || data.output || data.text || JSON.stringify(data),
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
