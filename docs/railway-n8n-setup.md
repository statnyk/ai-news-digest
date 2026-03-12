# Railway setup (n8n branch)

Use this when deploying the **n8n** branch to Railway so you can run the app and configure n8n workflows.

## Automatic pipeline (push → GitHub Actions → Railway)

On every **push to `n8n`**:

1. **GitHub Actions** (workflow `n8n → Docker → Railway`) runs: **Test** → **Build Docker image** → **Push to GHCR** as `ghcr.io/statnyk/ai-news-digest:n8n-latest` → **Trigger Railway deploy** (if configured).
2. **Railway** redeploys the app (from GitHub source or from the new image, depending on how the service is set up).

To enable the “trigger Railway deploy” step:

- In **Railway**: open your project → select the **App** service → **Settings** → **Deploy** → copy the **Deploy Hook** URL.
- In **GitHub**: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `RAILWAY_DEPLOY_HOOK_URL`, value = the deploy hook URL.

If you don’t add the secret, the workflow still runs tests and pushes the Docker image; it just skips calling Railway.

## 1. Create a Railway project for the n8n branch

- New project → Deploy from GitHub repo → **statnyk/ai-news-digest**
- Set **branch** to **n8n**

## 2. Add PostgreSQL

- In the project: **+ New** → **Database** → **PostgreSQL**
- Railway creates a Postgres service and exposes variables (e.g. `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`).

## 3. Create the `n8n` database (for n8n’s internal storage)

If you run **n8n** on Railway (or any self-hosted n8n that uses this Postgres), n8n needs its own database:

- Open the Postgres service → **Data** or **Query** (or connect with any client).
- Run: `CREATE DATABASE n8n;`
- If your plan uses one database only, you can use the default DB for both app and n8n; then set n8n’s `DB_POSTGRESDB_DATABASE` to that name. Prefer a dedicated `n8n` DB when possible.

## 4. Add the App service

- **+ New** → **GitHub Repo** → same repo, branch **n8n**
- Root directory: project root. Build: use **Dockerfile** (or Nixpacks if you prefer).
- In **Variables**, set:

  **App + Postgres (articles/topics):**

  - `POSTGRES_HOST` = Postgres internal hostname (from Postgres service variables, e.g. `${{Postgres.PGHOST}}` or the host Railway shows)
  - `POSTGRES_PORT` = `5432` (or `${{Postgres.PGPORT}}`)
  - `POSTGRES_DB` = main DB name (e.g. `railway` or the default)
  - `POSTGRES_USER` / `POSTGRES_PASSWORD` = from Postgres service

  **n8n webhooks (app calls n8n Cloud):**

  - `N8N_WEBHOOK_BASE_URL` = `https://statnyk.app.n8n.cloud/webhook`

  **Other:**

  - `OPENAI_API_KEY`, `RSS_FEEDS`, etc. as needed.

## 5. (Optional) Run n8n on Railway

If you deploy n8n as a service in the same project:

- **+ New** → **Docker Image** → `docker.n8n.io/n8nio/n8n:latest`
- **Variables** for n8n’s database:
  - `DB_TYPE=postgresdb`
  - `DB_POSTGRESDB_HOST` = Postgres internal host
  - `DB_POSTGRESDB_PORT=5432`
  - `DB_POSTGRESDB_DATABASE=n8n`
  - `DB_POSTGRESDB_USER` / `DB_POSTGRESDB_PASSWORD` = from Postgres service
- Expose n8n (e.g. public URL) if you need the UI; otherwise the app only needs n8n Cloud webhooks.

## 6. Deploy and configure workflows

- Deploy the app; health check: `/api/health`
- Configure workflows in **n8n Cloud** (statnyk.app.n8n.cloud) and point webhooks to `/chat`, `/digest`, `/pipeline` as in the repo.
- **Digest shows "0 articles"?** The digest workflow must use the **same PostgreSQL** as your app (`articles`, `topics`, `article_topics`). In n8n, set the digest workflow’s Postgres credential to that DB and re-import `src/workflows/02-weekly-digest.json` (it now uses topic/range from the webhook).

For “migrations failed” on n8n, see [n8n-production-database.md](n8n-production-database.md).
