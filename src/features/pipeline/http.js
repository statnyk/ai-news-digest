import { runIngestion } from "../../services/rssIngestion.js";
import { runIndexing } from "../../services/vectorIndexing.js";
import { runDigest, getRangeWindow } from "../../services/weeklyDigest.js";
import { log } from "../../utils/logger.js";
import { isN8nEnabled, forwardToN8n } from "../../utils/n8nWebhook.js";
import { formatDigestTitle } from "../digest/formatDigestTitle.js";
import { listTopicSources, getTopicBySlug } from "../../services/topics.js";
import config from "../../config/index.js";

export function registerPipelineRoutes(app) {
  app.post("/api/pipeline", async (req, res) => {
    const topicSlug = req.body?.topicSlug || null;
    const range = req.body?.range || "1w";

    log("API", `Pipeline request: topicSlug=${topicSlug}, range=${range}, n8n=${isN8nEnabled()}`);

    // Topic pipeline: always use Node ingestion + digest (n8n pipeline doesn't handle topics).
    if (topicSlug) {
      const stepErrors = [];
      let ingested = 0;
      let indexed = 0;
      let digest = null;

      try {
        const stats = await runIngestion({ topicSlug });
        ingested = stats?.totalInserted ?? 0;
        log("API", `Topic ingestion done: ${ingested} new, ${stats?.totalFetched ?? 0} fetched, ${stats?.totalSkipped ?? 0} skipped`);
      } catch (err) {
        log("API", `Topic ingestion failed: ${err.message}`);
        stepErrors.push({ step: "ingestion", error: err.message });
      }

      try {
        const result = await runDigest({ topicSlug, range });
        const markdown = await formatDigestTitle(result.markdown, topicSlug, range);
        digest = { articleCount: result.articleCount, markdown };
        log("API", `Topic digest done: ${result.articleCount} articles for ${topicSlug} / ${range}`);
      } catch (err) {
        log("API", `Topic digest failed: ${err.message}`);
        stepErrors.push({ step: "digest", error: err.message });
      }

      return res.json({
        ingested,
        indexed,
        digest,
        ...(stepErrors.length > 0 && { stepErrors }),
      });
    }

    // "All News" pipeline via n8n: send feeds, rangeStart, topicSlug, topicId in the body.
    if (isN8nEnabled()) {
      try {
        let feeds = config.rss.feeds.length > 0 ? config.rss.feeds : config.rss.defaultFeeds;
        const topicIdForN8n = null;

        const { startDate } = getRangeWindow(range);
        const body = {
          topicSlug: "",
          topicId: topicIdForN8n,
          range,
          rangeStart: startDate.toISOString(),
          feeds,
        };
        log("API", `n8n pipeline body: range=${range}, feedsCount=${body.feeds.length}`);

        const data = await forwardToN8n("pipeline", body);

        let digest = null;
        const payload = Array.isArray(data) && data[0]?.json != null
          ? data[0].json
          : (data?.json ?? data);
        if (payload?.digest?.markdown) {
          let markdown = payload.digest.markdown;
          markdown = await formatDigestTitle(markdown, topicSlug || null, range);
          digest = { articleCount: payload.digest.articleCount ?? null, markdown };
        }

        return res.json({
          ingested: payload?.ingested ?? data?.ingested ?? 0,
          indexed: payload?.indexed ?? data?.indexed ?? 0,
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
      const stats = await runIngestion();
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
      const result = await runDigest({ range });
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
