import express from "express";
import cors from "cors";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import config from "./config/index.js";
import { handleChatRequest } from "./services/ragChat.js";
import { runDigest } from "./services/weeklyDigest.js";
import { runIngestion } from "./services/rssIngestion.js";
import { runIndexing } from "./services/vectorIndexing.js";
import {
  listTopics,
  createTopic,
  listTopicSources,
  addTopicSource,
  removeTopicSource,
  updateTopicSource,
  getTopicSuggestions,
  deleteTopic,
} from "./services/topics.js";
import { log } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In development, run migrations on start so topic tables exist locally
const isDev = process.env.NODE_ENV !== "production";
if (isDev && process.env.SKIP_DEV_MIGRATE !== "true") {
  const migrationDir = resolve(__dirname, "migrations");
  const result = spawnSync("node", [resolve(migrationDir, "run.js")], {
    stdio: "inherit",
    env: { ...process.env },
    cwd: resolve(__dirname, ".."),
  });
  if (result.status !== 0) {
    console.error("Local dev: migrations failed. Fix the DB (e.g. docker-compose up -d) and try again.");
    process.exit(1);
  }
}

const app = express();
const PORT = Number.parseInt(process.env.PORT || process.env.API_PORT || "3001", 10);

app.use(cors());
app.use(express.json());

function topicErrorMessage(err) {
  if (err?.code === "42P01") {
    return "Topic feature is not initialized. Run `npm run migrate` and restart the server.";
  }
  return null;
}

// Serve the latest digest file from disk (avoids regenerating every time)
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

app.get("/api/topics", async (_req, res) => {
  try {
    const topics = await listTopics();
    res.json({ topics });
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topics list error: ${err.message}`);
    res.status(500).json({ error: "Failed to list topics." });
  }
});

app.post("/api/topics", async (req, res) => {
  try {
    const topic = await createTopic(req.body?.name || "");
    if (topic.error) return res.status(400).json(topic);
    res.status(201).json({ topic });
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic create error: ${err.message}`);
    res.status(500).json({ error: err.message || "Failed to create topic." });
  }
});

app.get("/api/topics/:slug/sources", async (req, res) => {
  try {
    const result = await listTopicSources(req.params.slug);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic source list error: ${err.message}`);
    res.status(500).json({ error: "Failed to list sources." });
  }
});

app.post("/api/topics/:slug/sources", async (req, res) => {
  try {
    const result = await addTopicSource(req.params.slug, req.body?.rssUrl || "");
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic source create error: ${err.message}`);
    res.status(500).json({ error: "Failed to add source." });
  }
});

app.delete("/api/topics/:slug/sources/:id", async (req, res) => {
  try {
    const sourceId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(sourceId)) return res.status(400).json({ error: "Invalid source id." });
    const result = await removeTopicSource(req.params.slug, sourceId);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic source delete error: ${err.message}`);
    res.status(500).json({ error: "Failed to remove source." });
  }
});

app.patch("/api/topics/:slug/sources/:id", async (req, res) => {
  try {
    const sourceId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(sourceId)) return res.status(400).json({ error: "Invalid source id." });
    const result = await updateTopicSource(req.params.slug, sourceId, req.body || {});
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic source update error: ${err.message}`);
    res.status(500).json({ error: "Failed to update source." });
  }
});

app.get("/api/topics/:slug/suggestions", async (req, res) => {
  try {
    const result = await getTopicSuggestions(req.params.slug);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic suggestions error: ${err.message}`);
    res.status(500).json({ error: "Failed to get suggestions." });
  }
});

app.delete("/api/topics/:slug", async (req, res) => {
  try {
    const result = await deleteTopic(req.params.slug);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    const message = topicErrorMessage(err);
    if (message) return res.status(503).json({ error: message });
    log("API", `Topic delete error: ${err.message}`);
    res.status(500).json({ error: "Failed to delete topic." });
  }
});

app.get("/api/digest", async (req, res) => {
  try {
    const generate = req.query.generate === "true";
    const topicSlug = req.query.topic ? String(req.query.topic) : null;
    const range = req.query.range ? String(req.query.range) : "1w";

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
