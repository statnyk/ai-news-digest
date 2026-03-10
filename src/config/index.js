import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../../.env") });

const config = {
  // ─── Postgres ─────────────────────────────────────────────
  // Supports DATABASE_URL (Railway/Render/Heroku) or individual POSTGRES_* vars
  db: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE !== "disable" ? { rejectUnauthorized: false } : false }
    : {
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        database: process.env.POSTGRES_DB || "ai_news_digest",
        user: process.env.POSTGRES_USER || "postgres",
        password: process.env.POSTGRES_PASSWORD || "changeme",
      },

  // ─── Qdrant ───────────────────────────────────────────────
  qdrant: {
    url: process.env.QDRANT_URL || "http://localhost:6333",
    collection: process.env.QDRANT_COLLECTION || "articles",
  },

  // ─── OpenAI ───────────────────────────────────────────────
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  },

  // ─── RSS ──────────────────────────────────────────────────
  rss: {
    feeds: (process.env.RSS_FEEDS || "").split(",").filter(Boolean),
  },

  // ─── Digest ───────────────────────────────────────────────
  digest: {
    outputDir: process.env.DIGEST_OUTPUT_DIR || "./outputs",
    days: parseInt(process.env.DIGEST_DAYS || "7", 10),
  },

  // ─── RAG ──────────────────────────────────────────────────
  rag: {
    topK: parseInt(process.env.RAG_TOP_K || "5", 10),
    similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || "0.7"),
    chunkSize: parseInt(process.env.CHUNK_SIZE || "500", 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || "50", 10),
  },
};

export default config;
