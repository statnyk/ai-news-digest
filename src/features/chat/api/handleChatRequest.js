import { answerQuestion } from "../use-cases/answerQuestion.js";

export async function handleChatRequest(body) {
  const question = body.message || body.question || body.text || "";
  if (!question) {
    return { error: "No question provided." };
  }
  return answerQuestion(question, { topicSlug: body.topicSlug || null });
}
