import { isN8nEnabled, forwardToN8n } from "../../../utils/n8nWebhook.js";
import { answerQuestion } from "../use-cases/answerQuestion.js";

export async function handleChatRequest(body) {
  const question = (body.message || body.question || body.text || "").trim();
  if (!question) {
    return { error: "No question provided." };
  }

  if (isN8nEnabled()) {
    const data = await forwardToN8n("chat", {
      message: question,
      sessionId: body.sessionId || "default",
      topicSlug: body.topicSlug || null,
    });
    const answer = data.answer || data.output || data.text || data.response || JSON.stringify(data);
    return { question, answer, sources: data.sources || [] };
  }

  return answerQuestion(question, { topicSlug: body.topicSlug || null });
}
