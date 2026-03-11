import { embedText, chatCompletion } from "../../../utils/openai.js";
import { log } from "../../../utils/logger.js";

import { SYSTEM_PROMPT } from "../model/systemPrompt.js";
import { hybridSearch } from "../lib/hybridSearch.js";
import { buildContext } from "../lib/buildContext.js";

export async function answerQuestion(question, options = {}) {
  log("RAG", `Question: "${question}"`);
  const topicSlug = options.topicSlug || null;

  // 1. Embed the question
  const questionVector = await embedText(question);

  // 2. Hybrid search: vector + keyword fallback
  const chunks = await hybridSearch(questionVector, question, topicSlug);
  log("RAG", `  Retrieved ${chunks.length} relevant chunks.`);

  // 3. Build context
  const context = buildContext(chunks);

  // 4. Generate grounded answer
  const userPrompt = `Context (retrieved articles):
${context}

---

User Question: ${question}

Please answer based on the context above. Include source citations with URLs.`;

  const answer = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
    maxTokens: 2000,
    temperature: 0.2,
  });

  return {
    question,
    answer,
    sources: chunks.map((c) => ({
      title: c.payload.title,
      url: c.payload.url,
      source: c.payload.source,
      score: c.score,
    })),
  };
}
