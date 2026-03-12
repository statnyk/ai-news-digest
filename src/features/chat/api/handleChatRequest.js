import config from "../../../config/index.js";
import { answerQuestion } from "../use-cases/answerQuestion.js";
import { log } from "../../../utils/logger.js";

async function forwardToN8n(question, sessionId) {
  const url = config.n8n.chatWebhookUrl;
  log("CHAT", `Forwarding to n8n webhook: ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatInput: question, sessionId: sessionId || "default" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`n8n webhook error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const answer = data.output || data.text || data.response || data.answer || JSON.stringify(data);

  return { question, answer, sources: [] };
}

export async function handleChatRequest(body) {
  const question = (body.message || body.question || body.text || "").trim();
  if (!question) {
    return { error: "No question provided." };
  }

  if (config.n8n.chatWebhookUrl) {
    return forwardToN8n(question, body.sessionId);
  }

  return answerQuestion(question, { topicSlug: body.topicSlug || null });
}
