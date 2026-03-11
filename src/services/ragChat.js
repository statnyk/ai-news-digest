/**
 * Legacy compatibility facade for RAG chat service.
 * Keep this file as stable entrypoint while internals are split by feature.
 */
export { answerQuestion } from "../features/chat/use-cases/answerQuestion.js";
export { handleChatRequest } from "../features/chat/api/handleChatRequest.js";

import { interactiveChat } from "../cli/ragInteractiveChat.js";

// Run directly
const isMain = process.argv[1] && process.argv[1].includes("ragChat");
if (isMain) {
  interactiveChat();
}
