import OpenAI from "openai";
import config from "../config/index.js";

let client;

export function getOpenAI() {
  if (!client) {
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is not set. Check your .env file.");
    }
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

/**
 * Generate embeddings for an array of text strings.
 * Returns an array of float arrays (vectors).
 */
export async function embedTexts(texts) {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

/**
 * Single-text embedding convenience wrapper.
 */
export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

/**
 * Chat completion with system + user messages.
 */
export async function chatCompletion(systemPrompt, userPrompt, options = {}) {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: options.model || config.openai.chatModel,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens || 1500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return response.choices[0].message.content;
}
