import {
  listTopics,
  createTopic,
  listTopicSources,
  addTopicSource,
  removeTopicSource,
  updateTopicSource,
  getTopicSuggestions,
  deleteTopic,
} from "../../services/topics.js";
import { log } from "../../utils/logger.js";

function topicErrorMessage(err) {
  if (err?.code === "42P01") {
    return "Topic feature is not initialized. Run `npm run migrate` and restart the server.";
  }
  return null;
}

export function registerTopicRoutes(app) {
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
}
