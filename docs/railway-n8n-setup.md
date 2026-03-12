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

- In the project: **+ New** (или `Ctrl+K` / `Cmd+K`) → **Database** → **PostgreSQL**
- Railway создаёт сервис Postgres и переменные (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`).

**Если пункт "Database" / PostgreSQL не появляется:**

- Убедитесь, что вы в нужном **проекте** (Project), а не только в сервисе приложения.
- Нажмите **+ New** на **Project Canvas** (главный экран проекта), а не в настройках одного сервиса.
- Альтернатива: [Railway → Deploy PostgreSQL](https://railway.com/deploy/postgresql) — шаблон из маркетплейса; выберите тот же проект при деплое.
- В некоторых планах Railway базы данных доступны только при наличии квоты; проверьте **Project Settings** → **Usage**.

## 3. Create the `n8n` database (for n8n’s internal storage)

If you run **n8n** on Railway (or any self-hosted n8n that uses this Postgres), n8n needs its own database:

- Open the Postgres service → **Data** or **Query** (or connect with any client).
- Run: `CREATE DATABASE n8n;`
- If your plan uses one database only, you can use the default DB for both app and n8n; then set n8n’s `DB_POSTGRESDB_DATABASE` to that name. Prefer a dedicated `n8n` DB when possible.

## 4. Разделение переменных по сервисам (одна БД — приложение, другая — n8n)

Один инстанс Postgres в Railway, но **две базы**: `railway` (или основная) для приложения, `n8n` для движка n8n. В билдах переменные задаются **по сервису**:

| Сервис | Переменные | База |
|--------|------------|------|
| **App** | Только `POSTGRES_*` (и опционально `DATABASE_URL`) | `railway` (или ваша основная БД) — таблицы articles, topics |
| **n8n** | Только `DB_TYPE` + `DB_POSTGRESDB_*` | `n8n` — воркфлоу, креды, запуски |

- У **App** не задавать `DB_POSTGRESDB_*`.
- У **n8n** не задавать `POSTGRES_*` для подключения приложения — они нужны только App и для credential воркфлоу внутри n8n.

Шаблон переменных: см. `.env.example` в репозитории (блоки «База приложения» и «База n8n»).

## 5. Add the App service

- **+ New** → **GitHub Repo** → same repo, branch **n8n**
- Root directory: project root. Build: use **Dockerfile** (or Nixpacks if you prefer).
- In **Variables** задать **только переменные для приложения** (база приложения + остальное):

  **База приложения (articles, topics):**

  - `POSTGRES_HOST` = хост Postgres (например `${{Postgres.PGHOST}}` или из Connect)
  - `POSTGRES_PORT` = `5432` (или `${{Postgres.PGPORT}}`)
  - `POSTGRES_DB` = **имя базы приложения** (часто `railway`)
  - `POSTGRES_USER` / `POSTGRES_PASSWORD` = из сервиса Postgres

  **Остальное:**

  - `N8N_WEBHOOK_BASE_URL` = `https://statnyk.app.n8n.cloud/webhook` (если чат/диджест через n8n Cloud)
  - `OPENAI_API_KEY`, `RSS_FEEDS` и т.д.

## 6. (Optional) Run n8n on Railway

Если поднимаете n8n в том же проекте:

- **+ New** → **Docker Image** → `docker.n8n.io/n8nio/n8n:latest`
- В **Variables** задать **только переменные для n8n** (его база):
  - `DB_TYPE=postgresdb`
  - `DB_POSTGRESDB_HOST` = хост Postgres (тот же сервис)
  - `DB_POSTGRESDB_PORT=5432`
  - `DB_POSTGRESDB_DATABASE=n8n`
  - `DB_POSTGRESDB_USER` / `DB_POSTGRESDB_PASSWORD` = из сервиса Postgres
- Expose n8n (e.g. public URL) if you need the UI; otherwise the app only needs n8n Cloud webhooks.

## 7. Deploy and configure workflows

- Deploy the app; health check: `/api/health`
- Configure workflows in **n8n Cloud** (statnyk.app.n8n.cloud) and point webhooks to `/chat`, `/digest`, `/pipeline` as in the repo.
- **Digest shows "0 articles"?** The digest workflow must use the **same PostgreSQL** as your app (`articles`, `topics`, `article_topics`). In n8n, set the digest workflow’s Postgres credential to that DB and re-import `src/workflows/02-weekly-digest.json` (it now uses topic/range from the webhook).

For “migrations failed” on n8n, see [n8n-production-database.md](n8n-production-database.md).

---

## 8. Two databases, two credentials (important)

On Railway you have **one** Postgres instance with **two** databases:

| Database   | Purpose | Who uses it |
|-----------|---------|-------------|
| **n8n**   | n8n’s internal storage (workflows, executions, credentials) | n8n app via `DB_POSTGRESDB_*` env vars. **No `articles` table.** |
| **App DB** (e.g. `railway` or `ai_news_digest`) | Application data: `articles`, `topics`, `article_embeddings`, etc. | App service + **n8n workflow nodes** that read/write articles |

**If you see `relation "articles" does not exist` in Postgres logs:**  
The workflow (e.g. RSS ingestion, digest, vector indexing) is using a Postgres credential that points at the **n8n** database. That database has no `articles` table.

**Fix in n8n:**

1. **Credentials** → add a **second** PostgreSQL credential (or edit the one used by workflows):
   - **Host / Port / User / Password** = same as your Railway Postgres (e.g. from Postgres service variables).
   - **Database** = **app database name** (e.g. `railway` — Railway default for the main DB — or the value of `POSTGRES_DB` / `PGDATABASE` that your App service uses).
2. In **every workflow** that touches `articles` (01 RSS, 02 digest, 03 vector indexing, 04 chat, 05 pipeline), set each **Postgres node** to use this **“App DB”** credential, not the one that points at the `n8n` database.
3. Ensure the app database has run migrations (so `articles` exists). See **Step 3 below**.

**Summary:** n8n’s **environment** uses the `n8n` database. n8n **workflow credentials** for reading/writing articles must use the **app** database.

---

## Step 3: Как создать таблицы (articles и др.) в базе приложения

Миграции создают таблицы `articles`, `topics`, `article_embeddings` и т.д. Сделать это можно одним из двух способов.

### Вариант A: Через деплой приложения (рекомендуется)

На Railway при **первом запуске** сервис приложения (App) сам запускает миграции в ту базу, которая указана в переменных окружения.

1. В Railway откройте сервис **App** (ваше приложение, не n8n).
2. **Variables** → проверьте, что заданы и совпадают с вашим Postgres:
   - `POSTGRES_HOST` = хост Postgres (например из `${{Postgres.PGHOST}}`)
   - `POSTGRES_PORT` = `5432` (или `${{Postgres.PGPORT}}`)
   - `POSTGRES_DB` = **имя базы приложения** (часто `railway` — дефолтное имя основной БД в Railway)
   - `POSTGRES_USER` / `POSTGRES_PASSWORD` = из сервиса Postgres
3. Сохраните переменные и сделайте **Redeploy** сервиса App. При старте приложение выполнит миграции и создаст таблицы в этой базе.
4. В n8n в credential для воркфлоу в поле **Database** укажите **то же** имя базы, что и в `POSTGRES_DB` (например `railway`).

Если после деплоя в логах App нет ошибок миграций — таблица `articles` уже есть в этой базе.

### Вариант B: Запустить миграции вручную с компьютера

Если App ещё не деплоили или хотите создать таблицы до деплоя:

1. В Railway откройте сервис **Postgres** → вкладка **Connect** или **Variables**. Скопируйте хост, порт, пользователь, пароль и **имя базы** (основной БД, обычно `railway`; не `n8n`).
2. У себя локально в корне проекта создайте/отредактируйте `.env` (или задайте переменные в терминале один раз):
   - `POSTGRES_HOST` = хост из Railway (например из TCP Proxy или внутренний хост, если подключаетесь из другого сервиса Railway).
   - `POSTGRES_PORT=5432`
   - `POSTGRES_DB=railway` (или то имя основной БД, которое показывает Railway)
   - `POSTGRES_USER` / `POSTGRES_PASSWORD` = из Railway.
3. В терминале выполните:
   ```bash
   npm run migrate
   ```
4. В логах должно быть что-то вроде: `✓ 001_create_articles.sql — success`, и т.д. После этого в этой базе есть `articles` и остальные таблицы.
5. В n8n в credential для воркфлоу в поле **Database** укажите то же имя (`railway` или как вы задали `POSTGRES_DB`).

**Важно:** и App на Railway, и credential в n8n должны указывать на **одну и ту же** базу (одно и то же имя в `POSTGRES_DB` / Database). База `n8n` — только для внутренних данных n8n, в ней таблиц приложения не будет.

---

## Подключение по URL (Railway TCP Proxy)

Если Railway даёт ссылку вида:

```text
postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:PORT/railway
```

то переменные такие:

| Переменная | Значение | Где использовать |
|------------|----------|------------------|
| Host | `maglev.proxy.rlwy.net` | App: `POSTGRES_HOST`. n8n credential: **Host** |
| Port | число из URL (подставьте вместо `PORT`) | App: `POSTGRES_PORT`. n8n credential: **Port** |
| Database | `railway` | App: `POSTGRES_DB`. n8n credential (для воркфлоу с `articles`): **Database** = `railway` |
| User | `postgres` | App: `POSTGRES_USER`. n8n credential: **User** |
| Password | ваш пароль из URL | App: `POSTGRES_PASSWORD`. n8n credential: **Password** |

**Не коммитьте `.env` с паролем в git.** В репозитории храните только шаблон (например `.env.example` без секретов).

Для **миграций с компьютера**: в `.env` пропишите `POSTGRES_HOST`, `POSTGRES_PORT` (реальный порт из URL), `POSTGRES_DB=railway`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=...` и выполните `npm run migrate`.
