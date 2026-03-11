import { registerChatRoutes } from "../features/chat/http.js";
import { registerTopicRoutes } from "../features/topics/http.js";
import { registerDigestRoutes } from "../features/digest/http.js";
import { registerPipelineRoutes } from "../features/pipeline/http.js";

export function registerRoutes(app) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerChatRoutes(app);
  registerTopicRoutes(app);
  registerDigestRoutes(app);
  registerPipelineRoutes(app);
}
