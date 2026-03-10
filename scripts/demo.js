/**
 * Full pipeline demo — runs ingestion → indexing → digest → sample chat.
 * Run: node scripts/demo.js
 */
import { runIngestion } from "../src/services/rssIngestion.js";
import { runIndexing } from "../src/services/vectorIndexing.js";
import { runDigest } from "../src/services/weeklyDigest.js";
import { answerQuestion } from "../src/services/ragChat.js";
import { closePool } from "../src/utils/db.js";

const SAMPLE_QUESTIONS = [
  "What are the latest developments in AI?",
  "What companies are making news in artificial intelligence?",
  "Are there any concerns about AI safety mentioned recently?",
];

async function demo() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   AI News Digest — Full Pipeline Demo       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: Ingest RSS
  console.log("━".repeat(50));
  console.log("STEP 1: RSS Ingestion");
  console.log("━".repeat(50));
  const ingestionStats = await runIngestion();
  console.log();

  // Step 2: Vector Indexing
  console.log("━".repeat(50));
  console.log("STEP 2: Vector Indexing");
  console.log("━".repeat(50));
  const indexStats = await runIndexing();
  console.log();

  // Step 3: Weekly Digest
  console.log("━".repeat(50));
  console.log("STEP 3: Weekly Digest Generation");
  console.log("━".repeat(50));
  const digestResult = await runDigest();
  console.log();

  // Step 4: Sample RAG Chat
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

      chatTranscript.push({
        question,
        answer: result.answer,
        sources: result.sources.map((s) => ({ title: s.title, url: s.url })),
      });
    } catch (err) {
      console.error(`Error on "${question}": ${err.message}`);
    }
  }

  // Summary
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

demo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
