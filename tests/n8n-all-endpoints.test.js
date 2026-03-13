import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import config from "../src/config/index.js";
import { createApp } from "../src/app/createApp.js";

function withN8nBase(url, fn) {
  const original = config.n8n.webhookBaseUrl;
  config.n8n.webhookBaseUrl = url;
  return fn().finally(() => { config.n8n.webhookBaseUrl = original; });
}

function startMockN8n(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : {};
        const handler = routes[req.url];
        if (handler) {
          handler(req, res, parsed);
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function startApp() {
  return new Promise((resolve) => {
    const app = createApp();
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── /api/chat → n8n /chat ───────────────────────────────────

test("POST /api/chat forwards to n8n /chat", async () => {
  let receivedBody;
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/chat": (_req, res, body) => {
      receivedBody = body;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output: "Hello from n8n chat" }));
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl, async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.answer, "Hello from n8n chat");
    assert.equal(receivedBody.message, "hello");
  });

  await closeServer(app);
  await closeServer(n8n);
});

// ─── /api/digest → n8n /digest ───────────────────────────────

test("GET /api/digest forwards to n8n /digest", async () => {
  let receivedBody;
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/digest": (_req, res, body) => {
      receivedBody = body;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ markdown: "# Weekly Digest\nFrom n8n", articleCount: 10 }));
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl, async () => {
    const res = await fetch(`${base}/api/digest?range=1d&topic=crypto`);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.markdown, "# Weekly Digest\nFrom n8n");
    assert.equal(data.articleCount, 10);
    assert.equal(receivedBody.topic, "crypto");
    assert.equal(receivedBody.range, "1d");
  });

  await closeServer(app);
  await closeServer(n8n);
});

test("GET /api/digest handles n8n response with output field", async () => {
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/digest": (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output: "# Digest via output" }));
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl, async () => {
    const res = await fetch(`${base}/api/digest`);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.markdown, "# Digest via output");
  });

  await closeServer(app);
  await closeServer(n8n);
});

// ─── /api/pipeline → n8n /pipeline ──────────────────────────

test.skip("POST /api/pipeline forwards to n8n /pipeline (WIP: fixing n8n workflow)", async () => {
  let receivedBody;
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/pipeline": (_req, res, body) => {
      receivedBody = body;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ingested: 5,
        indexed: 12,
        digest: { articleCount: 5, markdown: "# Fresh" },
      }));
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl, async () => {
    const res = await fetch(`${base}/api/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicSlug: "ai", range: "3d" }),
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.ingested, 5);
    assert.equal(data.indexed, 12);
    assert.equal(data.digest.markdown, "# Fresh");
    assert.equal(receivedBody.topicSlug, "ai");
    assert.equal(receivedBody.range, "3d");
  });

  await closeServer(app);
  await closeServer(n8n);
});

test("POST /api/pipeline returns 502 on n8n error", async () => {
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/pipeline": (_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("n8n failed");
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl, async () => {
    const res = await fetch(`${base}/api/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.ok(data.error.includes("n8n webhook error"));
  });

  await closeServer(app);
  await closeServer(n8n);
});

// ─── n8n URL construction ────────────────────────────────────

test("n8n base URL with trailing slash is handled correctly", async () => {
  let hitPath;
  const { server: n8n, url: n8nUrl } = await startMockN8n({
    "/chat": (req, res) => {
      hitPath = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output: "ok" }));
    },
  });
  const { server: app, base } = await startApp();

  await withN8nBase(n8nUrl + "/", async () => {
    await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });
    assert.equal(hitPath, "/chat");
  });

  await closeServer(app);
  await closeServer(n8n);
});
