/**
 * Migration runner — executes all .sql files in order.
 */
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { query, closePool } from "../utils/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log("🔧 Running database migrations...\n");

  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const filePath = join(__dirname, file);
    const sql = readFileSync(filePath, "utf-8");
    console.log(`  ▸ Executing ${file}...`);
    try {
      await query(sql);
      console.log(`    ✓ ${file} — success`);
    } catch (err) {
      console.error(`    ✗ ${file} — FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\n✅ All migrations completed.");
  await closePool();
}

runMigrations();
