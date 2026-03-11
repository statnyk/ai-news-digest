import { handleChatRequest } from "../../services/ragChat.js";
import { log } from "../../utils/logger.js";

export function registerChatRoutes(app) {
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
}
