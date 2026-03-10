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
const PORT = Number.parseInt(process.env.API_PORT || "3001", 10);

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
  try {
    log("API", "Pipeline started: ingest -> index -> digest");

    const ingestionStats = await runIngestion();
    const indexStats = await runIndexing();
    const digestResult = await runDigest();

    log("API", "Pipeline completed successfully");
    res.json({
      ingested: ingestionStats?.totalInserted ?? 0,
      indexed: indexStats?.chunks ?? 0,
      digest: {
        articleCount: digestResult.articleCount,
        markdown: digestResult.markdown,
      },
    });
  } catch (err) {
    log("API", `Pipeline error: ${err.message}`);
    res.status(500).json({ error: "Pipeline failed: " + err.message });
  }
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
