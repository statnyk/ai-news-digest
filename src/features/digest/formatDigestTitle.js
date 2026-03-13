import { getRangeWindow } from "../../services/weeklyDigest.js";
import { getTopicBySlug } from "../../services/topics.js";

/** Format digest markdown title to match previous UI: "📰 AI News Weekly Digest — {Topic} — Last 1 week" */
export async function formatDigestTitle(markdown, topicSlug, range) {
  if (!markdown || typeof markdown !== "string") return markdown;
  const { rangeLabel } = getRangeWindow(range || "1w");
  let topicName = null;
  if (topicSlug) {
    const topic = await getTopicBySlug(topicSlug);
    topicName = topic?.name ?? null;
  }
  const parts = ["📰 AI News Weekly Digest", topicName, rangeLabel].filter(Boolean);
  const newFirstLine = `# ${parts.join(" — ")}`;
  return markdown.replace(/^# 📰 AI News Weekly Digest.*$/m, newFirstLine);
}
