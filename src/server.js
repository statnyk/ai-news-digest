import express from "express";
import cors from "cors";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import config from "./config/index.js";
import { handleChatRequest } from "./services/ragChat.js";
import { runDigest } from "./services/weeklyDigest.js";
import { runIngestion } from "./services/rssIngestion.js";
import { runIndexing } from "./services/vectorIndexing.js";
import { log } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number.parseInt(process.env.PORT || process.env.API_PORT || "3001", 10);

app.use(cors());
app.use(express.json());

// Serve the latest digest file from disk (avoids regenerating every time)
function getLatestDigest() {
  const outputDir = resolve(config.digest.outputDir);
  try {
    const files = readdirSync(outputDir)
      .filter((f) => f.startsWith("weekly-digest-") && f.endsWith(".md"))
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const result = await handleChatRequest(req.body);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    log("API", `Chat error: ${err.message}`);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/digest", async (req, res) => {
  try {
    const generate = req.query.generate === "true";

    if (generate) {
      const result = await runDigest();
      return res.json({
        articleCount: result.articleCount,
        markdown: result.markdown,
      });
    }

    const cached = getLatestDigest();
    if (cached) {
      return res.json(cached);
    }

    const result = await runDigest();
    res.json({
      articleCount: result.articleCount,
      markdown: result.markdown,
    });
  } catch (err) {
    log("API", `Digest error: ${err.message}`);
    res.status(500).json({ error: "Failed to generate digest." });
  }
});

app.post("/api/pipeline", async (_req, res) => {
  log("API", "Pipeline started: ingest -> index -> digest");

  const stepErrors = [];
  let ingested = 0;
  let indexed = 0;
  let digest = null;

  // Step 1: RSS ingestion — failure is non-fatal, pipeline continues
  try {
    const stats = await runIngestion();
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
    const result = await runDigest();
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

// In production, serve the built frontend
const frontendDist = resolve(__dirname, "../frontend/dist");
try {
  readdirSync(frontendDist);
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(resolve(frontendDist, "index.html"));
  });
} catch {
  // frontend not built yet — dev mode
}

app.listen(PORT, () => {
  log("API", `Server running on http://localhost:${PORT}`);
});
