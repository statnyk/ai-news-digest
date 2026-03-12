/**
 * Full pipeline demo — runs ingestion → indexing → digest → sample chat.
 *
 * When N8N_WEBHOOK_BASE_URL is set, all steps are forwarded to n8n webhooks.
 * Otherwise runs the local pipeline (Postgres + Qdrant + OpenAI).
 *
 * Run: node scripts/demo.js
 */
import { runIngestion } from "../src/services/rssIngestion.js";
import { runIndexing } from "../src/services/vectorIndexing.js";
import { runDigest } from "../src/services/weeklyDigest.js";
import { answerQuestion } from "../src/services/ragChat.js";
import { closePool } from "../src/utils/db.js";
import { isN8nEnabled, forwardToN8n, getN8nWebhookUrl } from "../src/utils/n8nWebhook.js";

const SAMPLE_QUESTIONS = [
  "What are the latest developments in AI?",
  "What companies are making news in artificial intelligence?",
  "Are there any concerns about AI safety mentioned recently?",
];

async function demoLocal() {
  console.log("  Mode: LOCAL pipeline (Postgres + Qdrant + OpenAI)\n");

  console.log("━".repeat(50));
  console.log("STEP 1: RSS Ingestion");
  console.log("━".repeat(50));
  const ingestionStats = await runIngestion();
  console.log();

  console.log("━".repeat(50));
  console.log("STEP 2: Vector Indexing");
  console.log("━".repeat(50));
  const indexStats = await runIndexing();
  console.log();

  console.log("━".repeat(50));
  console.log("STEP 3: Weekly Digest Generation");
  console.log("━".repeat(50));
  const digestResult = await runDigest();
  console.log();

  console.log("━".repeat(50));
  console.log("STEP 4: RAG Chat Agent (Sample Questions)");
  console.log("━".repeat(50));
  console.log();

  const chatTranscript = [];
  for (const question of SAMPLE_QUESTIONS) {
    try {
      console.log(`Q: ${question}`);
      const result = await answerQuestion(question);
      console.log(`A: ${result.answer}`);
      console.log(`Sources: ${result.sources.map((s) => s.source).join(", ")}`);
      console.log();
      chatTranscript.push({ question, answer: result.answer });
    } catch (err) {
      console.error(`Error on "${question}": ${err.message}`);
    }
  }

  console.log("━".repeat(50));
  console.log("DEMO SUMMARY");
  console.log("━".repeat(50));
  console.log(`  Articles ingested: ${ingestionStats?.totalInserted || 0}`);
  console.log(`  Chunks indexed:    ${indexStats?.chunks || 0}`);
  console.log(`  Digest articles:   ${digestResult?.articleCount || 0}`);
  console.log(`  Digest file:       ${digestResult?.outputPath || "N/A"}`);
  console.log(`  Chat questions:    ${chatTranscript.length}`);
  console.log();

  await closePool();
}

async function demoN8n() {
  const base = getN8nWebhookUrl("");
  console.log(`  Mode: N8N webhooks (${base})\n`);

  // Step 1: Pipeline (ingest + index + digest via single n8n call)
  console.log("━".repeat(50));
  console.log("STEP 1: Pipeline via n8n /pipeline");
  console.log("━".repeat(50));
  let pipelineResult = null;
  try {
    pipelineResult = await forwardToN8n("pipeline", { topicSlug: null, range: "1w" });
    console.log(`  Ingested: ${pipelineResult.ingested ?? "n/a"}`);
    console.log(`  Indexed:  ${pipelineResult.indexed ?? "n/a"}`);
    if (pipelineResult.digest?.markdown) {
      console.log(`  Digest:   ${pipelineResult.digest.markdown.slice(0, 80)}...`);
    } else {
      console.log("  Digest:   (no markdown returned)");
    }
  } catch (err) {
    console.error(`  Pipeline error: ${err.message}`);
    console.log("  Trying /digest separately...");
    try {
      pipelineResult = await forwardToN8n("digest", { topic: null, range: "1w" });
      const md = pipelineResult.markdown || pipelineResult.output || pipelineResult.text || "";
      console.log(`  Digest:   ${md ? md.slice(0, 80) + "..." : "(empty response)"}`);
    } catch (err2) {
      console.error(`  Digest error: ${err2.message}`);
    }
  }
  console.log();

  // Step 2: Chat questions via n8n /chat
  console.log("━".repeat(50));
  console.log("STEP 2: Chat via n8n /chat");
  console.log("━".repeat(50));
  console.log();

  let answered = 0;
  for (const question of SAMPLE_QUESTIONS) {
    try {
      console.log(`Q: ${question}`);
      const data = await forwardToN8n("chat", {
        message: question,
        sessionId: "demo",
      });
      const answer = data.output || data.text || data.response || data.answer;
      if (answer) {
        console.log(`A: ${answer}`);
        answered++;
      } else {
        console.log("A: (empty response from n8n — check \"Respond to Webhook\" node)");
      }
      console.log();
    } catch (err) {
      console.error(`Error on "${question}": ${err.message}\n`);
    }
  }

  console.log("━".repeat(50));
  console.log("DEMO SUMMARY");
  console.log("━".repeat(50));
  console.log(`  n8n base:          ${base}`);
  console.log(`  Pipeline:          ${pipelineResult ? "OK" : "FAILED"}`);
  console.log(`  Chat questions:    ${answered}/${SAMPLE_QUESTIONS.length} answered`);
  console.log();
}

async function demo() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   AI News Digest — Full Pipeline Demo       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  if (isN8nEnabled()) {
    await demoN8n();
  } else {
    await demoLocal();
  }
}

demo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
