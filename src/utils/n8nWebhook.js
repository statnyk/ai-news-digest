import config from "../config/index.js";
import { log } from "./logger.js";

export function getN8nWebhookUrl(path) {
  const base = config.n8n.webhookBaseUrl;
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function isN8nEnabled() {
  return Boolean(config.n8n.webhookBaseUrl);
}

export async function forwardToN8n(path, body) {
  const url = getN8nWebhookUrl(path);
  log("N8N", `POST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`n8n webhook error (${res.status}): ${text}`);
  }

  if (!text || text.trim().length === 0) {
    log("N8N", `Warning: empty response from ${path}`);
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { output: text };
  }
}
