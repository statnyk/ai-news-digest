/**
 * Full setup script — runs migrations + creates Qdrant collection.
 * Run: node scripts/setup.js
 */
import { query, closePool } from "../src/utils/db.js";
import { ensureCollection } from "../src/utils/qdrant.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setup() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   AI News Digest + RAG Agent — Setup        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 1. Run database migrations
  console.log("1️⃣  Running database migrations...\n");
  const migrationPath = resolve(__dirname, "../src/migrations/001_create_articles.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  try {
    await query(sql);
    console.log("   ✓ Database tables created.\n");
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log("   ℹ Tables already exist — skipping.\n");
    } else {
      console.error("   ✗ Migration failed:", err.message);
      process.exit(1);
    }
  }

  // 2. Create Qdrant collection
  console.log("2️⃣  Setting up Qdrant vector store...\n");
  try {
    await ensureCollection();
    console.log("   ✓ Qdrant collection ready.\n");
  } catch (err) {
    console.error("   ✗ Qdrant setup failed:", err.message);
    console.error("   → Make sure Qdrant is running: docker-compose up -d qdrant\n");
    process.exit(1);
  }

  // 3. Verify connectivity
  console.log("3️⃣  Verifying connectivity...\n");

  try {
    const res = await query("SELECT COUNT(*) FROM articles");
    console.log(`   ✓ PostgreSQL: connected (${res.rows[0].count} articles in DB)`);
  } catch (err) {
    console.error("   ✗ PostgreSQL:", err.message);
  }

  console.log("\n✅ Setup complete! Next steps:");
  console.log("   1. Copy .env.example → .env and configure your API keys");
  console.log("   2. Run ingestion:  npm run ingest");
  console.log("   3. Run indexing:   npm run index");
  console.log("   4. Run digest:     npm run digest");
  console.log("   5. Start chat:     npm run chat\n");

  await closePool();
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
