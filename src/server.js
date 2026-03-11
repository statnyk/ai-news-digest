import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";

import { createApp } from "./app/createApp.js";
import { log } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV !== "production";

// In development, run migrations synchronously before starting
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

  // In production, run migrations asynchronously after the server is already
  // accepting requests. This lets Railway's healthcheck pass immediately while
  // migrations complete in the background (all SQL uses IF NOT EXISTS so it is
  // safe to run against an already-migrated database).
  if (!isDev) {
    const migrationDir = resolve(__dirname, "migrations");
    const child = spawn("node", [resolve(migrationDir, "run.js")], {
      stdio: "inherit",
      env: { ...process.env },
      cwd: resolve(__dirname, ".."),
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        console.error("Production: migrations failed. Check database configuration.");
      }
    });
  }
});
