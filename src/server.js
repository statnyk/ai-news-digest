import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createApp } from "./app/createApp.js";
import { log } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In development, run migrations on start so topic tables exist locally
const isDev = process.env.NODE_ENV !== "production";
if (isDev && process.env.SKIP_DEV_MIGRATE !== "true") {
  const migrationDir = resolve(__dirname, "migrations");
  const result = spawnSync("node", [resolve(migrationDir, "run.js")], {
    stdio: "inherit",
    env: { ...process.env },
    cwd: resolve(__dirname, ".."),
  });
  if (result.status !== 0) {
    console.error("Local dev: migrations failed. Fix the DB (e.g. docker-compose up -d) and try again.");
    process.exit(1);
  }
}

const app = createApp();
const PORT = Number.parseInt(process.env.PORT || process.env.API_PORT || "3001", 10);

app.listen(PORT, () => {
  log("API", `Server running on http://localhost:${PORT}`);
});
