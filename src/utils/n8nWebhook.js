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
  // #region agent log
  try {
    const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    const isArray = Array.isArray(parsed);
    fetch('http://127.0.0.1:7309/ingest/94f6280d-beb0-49b9-a946-c96c4c3de1cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f5b975'},body:JSON.stringify({sessionId:'f5b975',location:'n8nWebhook.js:afterFetch',message:'n8n response',data:{path,status:res.status,textLen:text?.length,isArray,keys},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  } catch (_) {}
  // #endregion

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
