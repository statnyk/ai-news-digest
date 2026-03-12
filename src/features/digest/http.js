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
    // #region agent log
    try {
      fetch('http://127.0.0.1:7309/ingest/94f6280d-beb0-49b9-a946-c96c4c3de1cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f5b975'},body:JSON.stringify({sessionId:'f5b975',location:'digest/http.js:entry',message:'GET /api/digest',data:{topic:req.query?.topic,range:req.query?.range,isN8nEnabled:isN8nEnabled()},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    } catch (_) {}
    // #endregion
    try {
      const topicSlug = req.query.topic ? String(req.query.topic) : null;
      const range = req.query.range ? String(req.query.range) : "1w";

      if (isN8nEnabled()) {
        const data = await forwardToN8n("digest", { topic: topicSlug, range });
        // #region agent log
        try {
          const keys = data && typeof data === 'object' ? Object.keys(data) : [];
          const hasMarkdown = !!(data && (data.markdown ?? data.json?.markdown));
          fetch('http://127.0.0.1:7309/ingest/94f6280d-beb0-49b9-a946-c96c4c3de1cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f5b975'},body:JSON.stringify({sessionId:'f5b975',location:'digest/http.js:afterForward',message:'n8n digest response shape',data:{keys,hasMarkdown,firstKeySample:keys[0] && data[keys[0]] != null ? typeof data[keys[0]] : undefined},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        } catch (_) {}
        // #endregion
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
      // #region agent log
      try {
        fetch('http://127.0.0.1:7309/ingest/94f6280d-beb0-49b9-a946-c96c4c3de1cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f5b975'},body:JSON.stringify({sessionId:'f5b975',location:'digest/http.js:catch',message:'digest 500',data:{errMessage:err.message},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      } catch (_) {}
      // #endregion
      log("API", `Digest error: ${err.message}`);
      res.status(500).json({ error: "Failed to generate digest." });
    }
  });
}
