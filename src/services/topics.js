import { query } from "../utils/db.js";
import { slugifyTopicName, isSafeRssUrl } from "../utils/topics.js";
import { chatCompletion } from "../utils/openai.js";

const SUGGESTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const suggestionsCache = new Map();

async function generateWelcomeContent(topicName) {
  const system = "You generate short UI copy for a news digest app. Output only valid JSON with two keys: title (short, e.g. \"Crypto Digest\") and description (one sentence for the welcome block, e.g. \"Ask questions about crypto and blockchain news.\"). No markdown.";
  const user = `Topic folder name: ${topicName}. Return JSON: {"title":"...","description":"..."}`;
  try {
    const raw = await chatCompletion(system, user, { maxTokens: 150, temperature: 0.3 });
    const json = raw.replace(/```json?\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(json);
    return {
      welcome_title: parsed.title ? String(parsed.title).slice(0, 80) : `${topicName} Digest`,
      welcome_description: parsed.description ? String(parsed.description).slice(0, 200) : `Ask questions about ${topicName} news. Answers are grounded in your indexed articles.`,
    };
  } catch {
    return {
      welcome_title: `${topicName} Digest`,
      welcome_description: `Ask questions about ${topicName} news. Answers are grounded in your indexed articles.`,
    };
  }
}

async function generateSuggestionsForTopic(topicName) {
  const system = "You suggest 3 short question prompts for a news Q&A chat. Output only a JSON array of exactly 3 strings, each one a question a user might ask. Example: [\"What are the latest updates?\", \"Any regulatory news?\", \"Which projects launched?\"]";
  const user = `Topic: ${topicName}. Return only a JSON array of 3 question strings.`;
  try {
    const raw = await chatCompletion(system, user, { maxTokens: 200, temperature: 0.5 });
    const json = raw.replace(/```json?\s*|\s*```/g, "").trim();
    const arr = JSON.parse(json);
    const list = Array.isArray(arr) ? arr : [];
    return list.slice(0, 3).map((s) => (typeof s === "string" ? s : String(s)).slice(0, 120));
  } catch {
    return [
      `What's new in ${topicName}?`,
      `Any recent ${topicName} news?`,
      `Summarize the latest ${topicName} updates.`,
    ];
  }
}

export async function listTopics() {
  const result = await query(
    `SELECT t.id, t.name, t.slug, t.created_at,
            t.welcome_title, t.welcome_description,
            COUNT(ts.id)::int AS source_count
     FROM topics t
     LEFT JOIN topic_sources ts
       ON ts.topic_id = t.id AND ts.active = TRUE
     GROUP BY t.id
     ORDER BY t.created_at DESC`
  );
  return result.rows;
}

export async function createTopic(name) {
  const cleaned = String(name || "").trim();
  const slug = slugifyTopicName(cleaned);
  if (!cleaned || !slug) {
    return { error: "Topic name is required." };
  }

  const result = await query(
    `INSERT INTO topics (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, slug, created_at, welcome_title, welcome_description`,
    [cleaned, slug]
  );
  const topic = result.rows[0];
  if (!topic) return { error: "Failed to create topic." };

  const welcome = await generateWelcomeContent(cleaned);
  await query(
    `UPDATE topics SET welcome_title = $1, welcome_description = $2 WHERE id = $3`,
    [welcome.welcome_title, welcome.welcome_description, topic.id]
  );
  return { ...topic, ...welcome };
}

export async function getTopicBySlug(slug) {
  const result = await query(
    `SELECT id, name, slug, created_at, welcome_title, welcome_description
     FROM topics
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  return result.rows[0] || null;
}

export async function getTopicSuggestions(slug) {
  const topic = await getTopicBySlug(slug);
  if (!topic) return { error: "Topic not found." };

  const cached = suggestionsCache.get(slug);
  if (cached && Date.now() - cached.ts < SUGGESTIONS_CACHE_TTL_MS) {
    return { suggestions: cached.questions };
  }

  const questions = await generateSuggestionsForTopic(topic.name);
  suggestionsCache.set(slug, { questions, ts: Date.now() });
  return { suggestions: questions };
}

export async function deleteTopic(slug) {
  const topic = await getTopicBySlug(slug);
  if (!topic) return { error: "Topic not found." };

  await query(`DELETE FROM topics WHERE id = $1`, [topic.id]);
  suggestionsCache.delete(slug);
  return { deleted: true, slug };
}

export async function listTopicSources(topicSlug) {
  const topic = await getTopicBySlug(topicSlug);
  if (!topic) return { error: "Topic not found." };

  const result = await query(
    `SELECT id, rss_url, active, created_at
     FROM topic_sources
     WHERE topic_id = $1
     ORDER BY created_at DESC`,
    [topic.id]
  );

  return { topic, sources: result.rows };
}

export async function addTopicSource(topicSlug, rssUrl) {
  const topic = await getTopicBySlug(topicSlug);
  if (!topic) return { error: "Topic not found." };

  if (!isSafeRssUrl(rssUrl)) {
    return { error: "Invalid RSS URL. Use http or https." };
  }

  const result = await query(
    `INSERT INTO topic_sources (topic_id, rss_url, active)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (topic_id, rss_url) DO UPDATE SET active = TRUE
     RETURNING id, rss_url, active, created_at`,
    [topic.id, rssUrl]
  );

  return { topic, source: result.rows[0] };
}
