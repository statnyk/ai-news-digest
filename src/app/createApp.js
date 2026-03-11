import express from "express";
import cors from "cors";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

import { registerRoutes } from "./registerRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  registerRoutes(app);

  // In production, serve the built frontend
  const frontendDist = resolve(__dirname, "../../frontend/dist");
  try {
    readdirSync(frontendDist);
    app.use(express.static(frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(resolve(frontendDist, "index.html"));
    });
  } catch {
    // frontend not built yet — dev mode
  }

  return app;
}
