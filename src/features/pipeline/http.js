import { runIngestion } from "../../services/rssIngestion.js";
import { runIndexing } from "../../services/vectorIndexing.js";
import { runDigest } from "../../services/weeklyDigest.js";
import { log } from "../../utils/logger.js";

export function registerPipelineRoutes(app) {
  app.post("/api/pipeline", async (req, res) => {
    log("API", "Pipeline started: ingest -> index -> digest");
    const topicSlug = req.body?.topicSlug || null;
    const range = req.body?.range || "1w";

    const stepErrors = [];
    let ingested = 0;
    let indexed = 0;
    let digest = null;

    // Step 1: RSS ingestion — failure is non-fatal, pipeline continues
    try {
      const stats = await runIngestion({ topicSlug });
      ingested = stats?.totalInserted ?? 0;
      log("API", `Ingestion done: ${ingested} new articles`);
    } catch (err) {
      log("API", `Ingestion failed: ${err.message}`);
      stepErrors.push({ step: "ingestion", error: err.message });
    }

    // Step 2: Vector indexing — failure is non-fatal (Qdrant may be unavailable)
    try {
      const stats = await runIndexing();
      indexed = stats?.chunks ?? 0;
      log("API", `Indexing done: ${indexed} chunks`);
    } catch (err) {
      log("API", `Indexing failed: ${err.message}`);
      stepErrors.push({ step: "indexing", error: err.message });
    }

    // Step 3: Digest generation — failure is non-fatal
    try {
      const result = await runDigest({ topicSlug, range });
      digest = { articleCount: result.articleCount, markdown: result.markdown };
      log("API", `Digest done: ${result.articleCount} articles`);
    } catch (err) {
      log("API", `Digest failed: ${err.message}`);
      stepErrors.push({ step: "digest", error: err.message });
    }

    log("API", `Pipeline complete. Step errors: ${stepErrors.length}`);

    // Always 200 with results; stepErrors provides observability into partial failures
    res.json({
      ingested,
      indexed,
      digest,
      ...(stepErrors.length > 0 && { stepErrors }),
    });
  });
}
