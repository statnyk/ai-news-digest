# Full-Stack FSD Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split current backend and frontend monolith files into smaller feature/domain modules while preserving existing behavior and contracts.

**Architecture:** Apply strangler migration. Keep current entrypoints stable while extracting bounded logic into new modules by domain and layer. Migrate backend first for API stability, then split frontend app composition and feature logic.

**Tech Stack:** Node.js (ESM), Express, React (Vite), localStorage persistence, existing service modules and SQL helpers.

---

### Task 1: Backend app extraction from `src/server.js`

**Files:**
- Create: `src/app/createApp.js`
- Create: `src/app/registerRoutes.js`
- Create: `src/features/chat/http.js`
- Create: `src/features/topics/http.js`
- Create: `src/features/digest/http.js`
- Create: `src/features/pipeline/http.js`
- Modify: `src/server.js`
- Test: `tests/server-routes-smoke.test.js`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app/createApp.js";

test("health endpoint returns ok payload", async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "ok");
  server.close();
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/server-routes-smoke.test.js`
Expected: FAIL with module or symbol not found (`createApp` does not exist yet).

**Step 3: Write minimal implementation**

Create `createApp` and route registration modules, move handlers from `src/server.js`, keep output contract unchanged.

**Step 4: Run test to verify it passes**

Run: `node --test tests/server-routes-smoke.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app src/features src/server.js tests/server-routes-smoke.test.js
git commit -m "refactor(api): extract express app and route modules"
```

### Task 2: Split `src/services/ragChat.js` into focused modules

**Files:**
- Create: `src/features/chat/model/systemPrompt.js`
- Create: `src/features/chat/lib/buildContext.js`
- Create: `src/features/chat/lib/hybridSearch.js`
- Create: `src/features/chat/use-cases/answerQuestion.js`
- Create: `src/features/chat/api/handleChatRequest.js`
- Create: `src/cli/ragInteractiveChat.js`
- Modify: `src/services/ragChat.js`
- Test: `tests/rag-chat-contract.test.js`

**Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "../src/services/ragChat.js";

test("handleChatRequest returns validation error on empty message", async () => {
  const result = await handleChatRequest({});
  assert.equal(result.error, "No question provided.");
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/rag-chat-contract.test.js`
Expected: FAIL if contract changed or import wiring is broken during extraction.

**Step 3: Write minimal implementation**

Extract internals into focused modules but keep `src/services/ragChat.js` exports and CLI behavior compatible.

**Step 4: Run test to verify it passes**

Run: `node --test tests/rag-chat-contract.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/chat src/cli src/services/ragChat.js tests/rag-chat-contract.test.js
git commit -m "refactor(rag): split chat service into feature modules"
```

### Task 3: Split frontend `frontend/src/App.jsx` by FSD layers

**Files:**
- Create: `frontend/src/app/App.jsx`
- Create: `frontend/src/pages/chat-page/ui/ChatPage.jsx`
- Create: `frontend/src/pages/digest-page/ui/DigestPage.jsx`
- Create: `frontend/src/widgets/chat-sidebar/ui/ChatSidebar.jsx`
- Create: `frontend/src/widgets/topic-manager/ui/TopicManagerModal.jsx`
- Create: `frontend/src/features/chat/model/useChatState.js`
- Create: `frontend/src/features/topics/model/useTopicsState.js`
- Create: `frontend/src/shared/lib/storage.js`
- Create: `frontend/src/shared/api/client.js`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/app/app-smoke.test.jsx` (if test runner enabled) or manual smoke script notes in docs

**Step 1: Write the failing test**

```jsx
import { render, screen } from "@testing-library/react";
import App from "./App.jsx";

test("renders header title", () => {
  render(<App />);
  expect(screen.getByText("AI News Digest")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --prefix frontend`
Expected: FAIL due to missing setup (if no runner) or module movement mismatch.

**Step 3: Write minimal implementation**

Move UI and state into FSD modules, keep rendered behavior and API calls unchanged, leave `frontend/src/App.jsx` as compatibility export to new root module.

**Step 4: Run test to verify it passes**

Run: `npm run test --prefix frontend` (or documented manual smoke checks if runner not configured).
Expected: PASS for configured tests or green manual checks.

**Step 5: Commit**

```bash
git add frontend/src
git commit -m "refactor(ui): split app monolith into fsd modules"
```

### Task 4: Verification and cleanup

**Files:**
- Modify: `README.md` (architecture section and entrypoints)
- Modify: `docs/plans/2026-03-11-fsd-refactor-design.md` (status update)

**Step 1: Run backend checks**

Run: `node --test tests/*.test.js`
Expected: PASS.

**Step 2: Run frontend build checks**

Run: `npm run build`
Expected: PASS for frontend build and no runtime import issues.

**Step 3: Manual smoke checks**

Run:
- `npm run dev`
- verify `GET /api/health`
- verify chat send/reply
- verify topic CRUD and source CRUD
- verify digest refresh pipeline

Expected: all key flows behave as before.

**Step 4: Commit docs/status updates**

```bash
git add README.md docs/plans/2026-03-11-fsd-refactor-design.md
git commit -m "docs: document fsd architecture and migration status"
```
