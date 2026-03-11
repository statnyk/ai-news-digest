import { query } from "../utils/db.js";
import { slugifyTopicName, isSafeRssUrl } from "../utils/topics.js";

export async function listTopics() {
  const result = await query(
    `SELECT t.id, t.name, t.slug, t.created_at,
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
     RETURNING id, name, slug, created_at`,
    [cleaned, slug]
  );

  return result.rows[0];
}

export async function getTopicBySlug(slug) {
  const result = await query(
    `SELECT id, name, slug, created_at
     FROM topics
     WHERE slug = $1
     LIMIT 1`,
    [slug]
  );
  return result.rows[0] || null;
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
