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
  return new Promise((resolve) => server.close(resolve));
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

test("forwards question to n8n webhook and returns answer", async () => {
  const { server, url } = await createMockN8nServer((_req, res, body) => {
    assert.equal(body.chatInput, "What is AI?");
    assert.ok(body.sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "AI is artificial intelligence." }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    const result = await handleChatRequest({ message: "What is AI?" });
    assert.equal(result.answer, "AI is artificial intelligence.");
    assert.equal(result.question, "What is AI?");
    assert.deepEqual(result.sources, []);
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("passes sessionId from request body to n8n webhook", async () => {
  let receivedBody;
  const { server, url } = await createMockN8nServer((_req, res, body) => {
    receivedBody = body;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    await handleChatRequest({ message: "hi", sessionId: "session-42" });
    assert.equal(receivedBody.sessionId, "session-42");
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("uses default sessionId when none provided", async () => {
  let receivedBody;
  const { server, url } = await createMockN8nServer((_req, res, body) => {
    receivedBody = body;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    await handleChatRequest({ message: "hi" });
    assert.equal(receivedBody.sessionId, "default");
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("handles n8n response with 'text' field", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: "response via text field" }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    const result = await handleChatRequest({ message: "test" });
    assert.equal(result.answer, "response via text field");
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("handles n8n response with 'response' field", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: "response via response field" }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    const result = await handleChatRequest({ message: "test" });
    assert.equal(result.answer, "response via response field");
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("throws on n8n webhook HTTP error", async () => {
  const { server, url } = await createMockN8nServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    await assert.rejects(
      () => handleChatRequest({ message: "test" }),
      (err) => {
        assert.match(err.message, /n8n webhook error \(500\)/);
        return true;
      },
    );
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

test("sends POST with correct Content-Type header", async () => {
  let receivedHeaders;
  const { server, url } = await createMockN8nServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "ok" }));
  });

  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = url;

  try {
    await handleChatRequest({ message: "hello" });
    assert.equal(receivedHeaders["content-type"], "application/json");
  } finally {
    config.n8n.chatWebhookUrl = original;
    await closeServer(server);
  }
});

// ─── Fallback to local RAG ───────────────────────────────────

test("falls back to local answerQuestion when webhook URL is empty", async () => {
  const original = config.n8n.chatWebhookUrl;
  config.n8n.chatWebhookUrl = "";

  try {
    const result = await handleChatRequest({ message: "test" });
    // If local RAG services are running, we get a valid answer;
    // if not, an error is thrown — either way it must NOT be an n8n error
    assert.ok(result.answer || result.error, "Should return answer or error");
    assert.ok(!result.error?.includes("n8n webhook"), "Should not be an n8n error");
  } catch (err) {
    assert.ok(!err.message.includes("n8n webhook"), "Should not be an n8n error");
  } finally {
    config.n8n.chatWebhookUrl = original;
  }
});
