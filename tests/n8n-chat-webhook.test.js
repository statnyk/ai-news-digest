import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import config from "../src/config/index.js";
import { handleChatRequest } from "../src/features/chat/api/handleChatRequest.js";

function createMockN8nServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => handler(req, res, JSON.parse(body)));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
}

function withN8nBase(url, fn) {
  const original = config.n8n.webhookBaseUrl;
  config.n8n.webhookBaseUrl = url;
  return fn().finally(() => { config.n8n.webhookBaseUrl = original; });
}

// ─── Validation (no n8n involved) ─────────────────────────────

test("handleChatRequest rejects empty payload", async () => {
  const result = await handleChatRequest({});
  assert.equal(result.error, "No question provided.");
});

test("handleChatRequest rejects whitespace-only message", async () => {
  const result = await handleChatRequest({ message: "   " });
  assert.equal(result.error, "No question provided.");
});

// ─── n8n webhook forwarding ───────────────────────────────────

test("forwards question to n8n /chat and returns answer", async () => {
  const { server, url } = await createMockN8nServer((req, res, body) => {
    assert.ok(req.url.endsWith("/chat"));
    assert.equal(body.message, "What is AI?");
    assert.ok(body.sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "AI is artificial intelligence." }));
  });

  await withN8nBase(url, async () => {
    const result = await handleChatRequest({ message: "What is AI?" });
    assert.equal(result.answer, "AI is artificial intelligence.");
    assert.equal(result.question, "What is AI?");
    assert.deepEqual(result.sources, []);
  });

  await closeServer(server);
});

test("passes sessionId from request body to n8n webhook", async () => {
  let receivedBody;
  const { server, url } = await createMockN8nServer((_req, res, body) => {
    receivedBody = body;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  await withN8nBase(url, async () => {
    await handleChatRequest({ message: "hi", sessionId: "session-42" });
    assert.equal(receivedBody.sessionId, "session-42");
  });

  await closeServer(server);
});

test("uses default sessionId when none provided", async () => {
  let receivedBody;
  const { server, url } = await createMockN8nServer((_req, res, body) => {
    receivedBody = body;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  await withN8nBase(url, async () => {
    await handleChatRequest({ message: "hi" });
    assert.equal(receivedBody.sessionId, "default");
  });

  await closeServer(server);
});

test("handles n8n response with 'text' field", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: "response via text field" }));
  });

  await withN8nBase(url, async () => {
    const result = await handleChatRequest({ message: "test" });
    assert.equal(result.answer, "response via text field");
  });

  await closeServer(server);
});

test("handles n8n response with 'response' field", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: "response via response field" }));
  });

  await withN8nBase(url, async () => {
    const result = await handleChatRequest({ message: "test" });
    assert.equal(result.answer, "response via response field");
  });

  await closeServer(server);
});

test("throws on n8n webhook HTTP error", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  });

  await withN8nBase(url, async () => {
    await assert.rejects(
      () => handleChatRequest({ message: "test" }),
      (err) => {
        assert.match(err.message, /n8n webhook error \(500\)/);
        return true;
      },
    );
  });

  await closeServer(server);
});

test("sends POST with correct Content-Type header", async () => {
  let receivedHeaders;
  const { server, url } = await createMockN8nServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  await withN8nBase(url, async () => {
    await handleChatRequest({ message: "hello" });
    assert.equal(receivedHeaders["content-type"], "application/json");
  });

  await closeServer(server);
});

// ─── Fallback to local RAG ───────────────────────────────────

test("falls back to local answerQuestion when webhook URL is empty", async () => {
  await withN8nBase("", async () => {
    try {
      const result = await handleChatRequest({ message: "test" });
      assert.ok(result.answer || result.error, "Should return answer or error");
      assert.ok(!result.error?.includes("n8n webhook"), "Should not be an n8n error");
    } catch (err) {
      assert.ok(!err.message.includes("n8n webhook"), "Should not be an n8n error");
    }
  });
});
