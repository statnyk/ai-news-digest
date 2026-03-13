import { runIngestion } from "../../services/rssIngestion.js";
import { runIndexing } from "../../services/vectorIndexing.js";
import { runDigest } from "../../services/weeklyDigest.js";
import { log } from "../../utils/logger.js";
import { isN8nEnabled, forwardToN8n } from "../../utils/n8nWebhook.js";
import { formatDigestTitle } from "../digest/formatDigestTitle.js";

export function registerPipelineRoutes(app) {
  app.post("/api/pipeline", async (req, res) => {
    const topicSlug = req.body?.topicSlug || null;
    const range = req.body?.range || "1w";

    if (isN8nEnabled()) {
      // n8n pipeline only ingests default feeds; run topic ingestion in Node so article_topics
      // is populated for the selected folder (Folders feature).
      if (topicSlug) {
        try {
          await runIngestion({ topicSlug });
        } catch (err) {
          log("API", `Topic ingestion before pipeline: ${err.message}`);
        }
      }
      try {
        const data = await forwardToN8n("pipeline", { topicSlug, range });
        // Digest always comes from the digest webhook (02) so it respects topicSlug + range
        // and uses the same markdown format. Pipeline 05 no longer returns a digest.
        let digest = null;
        try {
          const digestData = await forwardToN8n("digest", {
            topic: topicSlug || undefined,
            topicSlug: topicSlug || "",
            range: range || "1w",
          });
          const payload = Array.isArray(digestData) && digestData[0]?.json != null
            ? digestData[0].json
            : (digestData?.json ?? digestData);
          let markdown = payload?.markdown || payload?.output || payload?.text || "";
          markdown = await formatDigestTitle(markdown, topicSlug || null, range);
          digest = { articleCount: payload?.articleCount ?? null, markdown };
        } catch (digestErr) {
          log("API", `n8n digest after pipeline: ${digestErr.message}`);
        }
        return res.json({
          ingested: data.ingested ?? 0,
          indexed: data.indexed ?? 0,
          digest,
        });
      } catch (err) {
        log("API", `n8n pipeline error: ${err.message}`);
        return res.status(502).json({ error: err.message });
      }
    }

    log("API", "Pipeline started: ingest -> index -> digest");

    const stepErrors = [];
    let ingested = 0;
    let indexed = 0;
    let digest = null;

    try {
      const stats = await runIngestion({ topicSlug });
      ingested = stats?.totalInserted ?? 0;
      log("API", `Ingestion done: ${ingested} new articles`);
    } catch (err) {
      log("API", `Ingestion failed: ${err.message}`);
      stepErrors.push({ step: "ingestion", error: err.message });
    }

    try {
      const stats = await runIndexing();
      indexed = stats?.chunks ?? 0;
      log("API", `Indexing done: ${indexed} chunks`);
    } catch (err) {
      log("API", `Indexing failed: ${err.message}`);
      stepErrors.push({ step: "indexing", error: err.message });
    }

    try {
      const result = await runDigest({ topicSlug, range });
      digest = { articleCount: result.articleCount, markdown: result.markdown };
      log("API", `Digest done: ${result.articleCount} articles`);
    } catch (err) {
      log("API", `Digest failed: ${err.message}`);
      stepErrors.push({ step: "digest", error: err.message });
    }

    log("API", `Pipeline complete. Step errors: ${stepErrors.length}`);

    res.json({
      ingested,
      indexed,
      digest,
      ...(stepErrors.length > 0 && { stepErrors }),
    });
  });
}
