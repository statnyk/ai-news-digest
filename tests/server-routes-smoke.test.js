import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app/createApp.js";

test("GET /api/health returns status ok", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
