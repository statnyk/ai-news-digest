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
      // #region agent log
      try {
        fetch('http://127.0.0.1:7309/ingest/94f6280d-beb0-49b9-a946-c96c4c3de1cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f5b975'},body:JSON.stringify({sessionId:'f5b975',location:'chat/http.js:catch',message:'chat 500',data:{errMessage:err.message},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      } catch (_) {}
      // #endregion
      log("API", `Chat error: ${err.message}`);
      res.status(500).json({ error: "Internal server error." });
    }
  });
}
