import test from "node:test";
import assert from "node:assert/strict";

import { handleChatRequest } from "../src/services/ragChat.js";

test("handleChatRequest validates empty payload", async () => {
  const result = await handleChatRequest({});
  assert.equal(result.error, "No question provided.");
});
