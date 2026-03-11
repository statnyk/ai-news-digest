# FSD Refactor Design (Full Stack)

## Context

The project currently has backend and frontend monolith files that are hard to maintain:
- Backend entrypoint `src/server.js` contains bootstrapping, route registration, route handlers, and file-serving logic.
- Backend service `src/services/ragChat.js` combines domain logic, API adapter logic, and CLI runtime in one module.
- Frontend `frontend/src/App.jsx` contains state, API calls, presentation components, and topic management UI in a single file.

## Goals

1. Split large files into feature-aligned modules.
2. Keep behavior and API contracts unchanged during migration.
3. Introduce FSD-style boundaries for frontend and feature/domain boundaries for backend.
4. Enable incremental future refactors without large rewrites.

## Non-Goals

- No product behavior changes.
- No API shape changes.
- No visual redesign.
- No database schema changes.

## Recommended Approach

Use a strangler migration:

1. Create target folder structure.
2. Extract code into feature/domain modules in small steps.
3. Keep existing entrypoint files as composition facades during migration.
4. Verify after each step.
5. Remove temporary adapters only after parity is confirmed.

## Target Architecture

### Frontend (FSD-like)

`frontend/src`:
- `app/` - app bootstrap, providers, global styles, root composition
- `pages/` - page-level composition (`chat-page`, `digest-page`)
- `widgets/` - large UI blocks (`chat-layout`, `sidebar`, `topic-manager`)
- `features/` - user actions and business interactions (`send-message`, `manage-topic`, `switch-mode`)
- `entities/` - core business entities (`conversation`, `topic`, `message`, `digest`)
- `shared/` - reusable ui/api/lib/config utilities

### Backend (feature/domain layered)

`src`:
- `app/` - express app creation, middleware, route registration, server start
- `processes/` - orchestration flows (pipeline, digest generation flow)
- `features/` - route-level handlers grouped by use case (`chat`, `topics`, `digest`, `pipeline`)
- `entities/` - domain logic grouped by entity (`topic`, `article`, `digest`)
- `shared/` - infra/util modules (`db`, `logger`, `openai`, `qdrant`, config)
- `cli/` - command-line runtime entrypoints (e.g., rag interactive mode)

## Migration Phases

1. **Backend App Layer Split**
   - Extract route handlers and app construction from `src/server.js`.
   - Keep `src/server.js` as thin bootstrap.

2. **RAG Service Split**
   - Split `src/services/ragChat.js` into:
     - core answer use case
     - retrieval strategy
     - context builder
     - API adapter
     - CLI runner

3. **Frontend App Split**
   - Split `frontend/src/App.jsx` into:
     - `app` root
     - chat and digest pages
     - widgets and feature hooks/actions
     - shared utility and API modules

4. **Cleanup and Contract Checks**
   - Remove dead code and temporary compatibility wrappers.
   - Re-run verification and smoke tests.

## Risks and Mitigations

- **Risk:** regressions due to moving code.
  - **Mitigation:** no behavior changes, keep exports stable, verify after each phase.
- **Risk:** temporary duplication/confusion.
  - **Mitigation:** explicit migration notes and deterministic target locations.
- **Risk:** refactor fatigue on large files.
  - **Mitigation:** phased extraction by bounded contexts.

## Success Criteria

- No single backend/frontend module remains monolithic with mixed responsibilities.
- Existing endpoints and UI flows continue to work.
- New structure supports clear ownership by feature/domain.
