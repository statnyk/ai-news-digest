# AI News Digest — TODO

## Текущий статус

- [x] Frontend (React + Vite) — готов
- [x] Backend API (Express) — готов
- [x] GitHub Pages — деплоится автоматически (только фронтенд, без API)
- [x] Docker image `ghcr.io/statnyk/ai-news-digest:latest` — собирается при пуше в `main`
- [x] GitHub Actions — два workflow: Pages deploy + Docker build/push
- [x] `DATABASE_URL` support — Railway/Render/Heroku подключаются автоматически
- [x] `railway.json` — конфиг для авто-деплоя на Railway

## Известные проблемы

- **404/405 на GitHub Pages** — это нормально. GitHub Pages = статика, API там не работает. Решение: развернуть бэкенд на Railway (см. ниже)

---

## 🚀 Быстрый старт — Railway (рекомендуется)

> Авто-деплой бэкенда при каждом пуше в `main`. HTTPS, PostgreSQL и Qdrant — всё управляется через Railway.

### Шаг 1 — Создать проект на Railway

1. Зайти на [railway.app](https://railway.app) → **New Project**
2. Выбрать **Deploy from GitHub repo** → выбрать `statnyk/ai-news-digest`
3. Railway найдёт `Dockerfile` и `railway.json` → нажать **Deploy**

### Шаг 2 — Добавить PostgreSQL

В проекте: **+ New** → **Database** → **Add PostgreSQL**

Railway автоматически добавит переменную `DATABASE_URL` в сервис приложения.

### Шаг 3 — Добавить Qdrant

В проекте: **+ New** → **Docker Image** → ввести `qdrant/qdrant:v1.12.4`

После деплоя Qdrant зайти в его **Variables** и скопировать внутренний hostname (вида `qdrant.railway.internal`).

В переменных приложения добавить:
```
QDRANT_URL=http://qdrant.railway.internal:6333
```

### Шаг 4 — Добавить переменные окружения

В сервисе приложения → **Variables** → добавить:

| Переменная | Значение |
|---|---|
| `OPENAI_API_KEY` | ключ OpenAI |
| `RSS_FEEDS` | RSS фиды через запятую |
| `NODE_ENV` | `production` |

> `DATABASE_URL` Railway добавит сам из PostgreSQL сервиса.

### Шаг 5 — Получить домен

В сервисе приложения → **Settings** → **Networking** → **Generate Domain**

Railway выдаст домен вида `ai-news-digest-production.up.railway.app`.

### Шаг 6 — Связать GitHub Pages с Railway API

1. Зайти в репо GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Добавить секрет: `VITE_API_URL` = `https://ai-news-digest-production.up.railway.app`
3. Перезапустить workflow **Build & Deploy to GitHub Pages**

### Результат

- Пуш в `main` → Railway автоматически пересобирает и деплоит бэкенд
- Пуш в `main` → GitHub Actions деплоит фронтенд на GitHub Pages
- GitHub Pages → обращается к Railway API → PostgreSQL + Qdrant

---

## Что нужно сделать

### 1. Развернуть на VPS (Docker)

На VPS с Docker + Docker Compose:

```bash
# Склонировать репо (или скопировать docker-compose.yml + .env)
git clone https://github.com/statnyk/ai-news-digest.git
cd ai-news-digest

# Создать .env файл с переменными:
cp .env.example .env   # или создать вручную
```

**Обязательные переменные в `.env`:**

| Переменная | Описание |
|---|---|
| `OPENAI_API_KEY` | API ключ OpenAI |
| `POSTGRES_PASSWORD` | Пароль для PostgreSQL (сменить с дефолтного) |
| `RSS_FEEDS` | RSS фиды через запятую |

**Запуск:**

```bash
docker compose pull && docker compose up -d
```

Приложение будет на `http://your-vps-ip:3001` (фронтенд + API вместе).

### 2. Reverse proxy + HTTPS ✅

- [x] Создан `Caddyfile` — Caddy автоматически получает SSL сертификат от Let's Encrypt
- [x] Создан `docker-compose.prod.yml` — overlay с Caddy поверх основного compose

**Запуск с HTTPS на VPS:**

```bash
# Добавить в .env:
DOMAIN=your-domain.com
LETSENCRYPT_EMAIL=you@example.com   # опционально, для уведомлений

# Запустить с production overlay:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Caddy сам получит и будет обновлять сертификат. Приложение будет на `https://your-domain.com`.

### 3. Связать GitHub Pages с бэкендом ✅

- [x] В `.github/workflows/deploy.yml` добавлена передача `VITE_API_URL` при билде фронтенда

**Что нужно сделать вручную:**
1. Зайти в репо → Settings → Secrets and variables → Actions
2. Добавить секрет `VITE_API_URL=https://your-domain.com`
3. Перезапустить workflow Pages — GitHub Pages начнёт обращаться к вашему API

### 4. Авто-обновление на VPS ✅

- [x] Watchtower добавлен в `docker-compose.prod.yml` — следит за обновлениями образов
- [x] В `.github/workflows/docker.yml` добавлен job `deploy` — SSH деплой после пуша образа

**SSH деплой (опционально, если нужен мгновенный деплой):**

Добавить GitHub Secrets:

| Secret | Описание |
|---|---|
| `SSH_HOST` | IP или домен VPS |
| `SSH_USER` | SSH пользователь (например, `ubuntu`) |
| `SSH_KEY` | Приватный SSH ключ |
| `SSH_PORT` | SSH порт (по умолчанию 22) |
| `DEPLOY_PATH` | Путь к проекту (по умолчанию `~/ai-news-digest`) |

После добавления секретов — при каждом пуше в `main` новый образ автоматически деплоится на VPS.

**Watchtower (альтернатива — деплой по расписанию):**

Watchtower запускается каждую ночь в 03:00 и обновляет контейнеры.
Расписание можно изменить через `WATCHTOWER_SCHEDULE` в `.env`:

```env
WATCHTOWER_SCHEDULE=0 0 3 * * *   # каждый день в 03:00 (cron-формат)
```

---

## 🚀 Продвинутый вариант — облачный деплой без VPS

> Всё ниже работает само: HTTPS, PostgreSQL, авто-деплой при пуше в `main`.
> Тебе не нужен сервер, SSH, Caddy или Watchtower.

### Вариант A — Railway (рекомендуется, проще всего)

**Что делает сам:** деплоит Docker образ, поднимает PostgreSQL, выдаёт HTTPS домен, авто-деплой из GitHub.

- [ ] Зайти на [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
- [ ] Добавить сервис PostgreSQL: + New → Database → PostgreSQL
- [ ] Добавить переменные окружения в Railway (вкладка Variables):
  - `OPENAI_API_KEY`
  - `RSS_FEEDS`
  - `DATABASE_URL` — Railway подставит автоматически из PostgreSQL сервиса
- [ ] В настройках сервиса указать образ: `ghcr.io/statnyk/ai-news-digest:latest`
  *(или Railway сам собирает из Dockerfile при каждом пуше)*
- [ ] Railway выдаст домен вида `ai-news-digest.up.railway.app` — скопировать его
- [ ] Добавить GitHub Secret `VITE_API_URL=https://ai-news-digest.up.railway.app`
- [ ] Готово — GitHub Pages → Railway API → PostgreSQL, всё по HTTPS

**Цена:** ~$5/мес (или бесплатно в рамках trial $5)

---

### Вариант B — Render

**Что делает сам:** то же самое, чуть медленнее холодный старт на free tier.

- [ ] Зайти на [render.com](https://render.com) → New → Web Service → Connect GitHub
- [ ] Render сам найдёт Dockerfile и начнёт деплоить
- [ ] Добавить PostgreSQL: New → PostgreSQL → скопировать `DATABASE_URL`
- [ ] Добавить переменные: `OPENAI_API_KEY`, `RSS_FEEDS`, `DATABASE_URL`
- [ ] Скопировать выданный домен `*.onrender.com` → GitHub Secret `VITE_API_URL`

**Цена:** бесплатный tier есть (засыпает после 15 мин неактивности), платный ~$7/мес

---

### Вариант C — Fly.io (для тех кто хочет контроль)

- [ ] Установить `flyctl`: `curl -L https://fly.io/install.sh | sh`
- [ ] `fly launch` в папке проекта — создаст `fly.toml` автоматически
- [ ] `fly postgres create` — управляемая PostgreSQL
- [ ] `fly secrets set OPENAI_API_KEY=... RSS_FEEDS=...`
- [ ] Добавить в `.github/workflows/docker.yml` деплой через `fly deploy`
- [ ] Скопировать домен `*.fly.dev` → GitHub Secret `VITE_API_URL`

**Цена:** ~$3-5/мес, есть free allowance

---

### Сравнение

| | Railway | Render | Fly.io | Self-hosted VPS |
|---|---|---|---|---|
| Настройка | 10 мин | 15 мин | 30 мин | 1-2 часа |
| Авто-деплой из GitHub | ✅ | ✅ | ✅ (нужен step) | ✅ (нужен step) |
| Managed PostgreSQL | ✅ | ✅ | ✅ | ❌ |
| HTTPS автоматом | ✅ | ✅ | ✅ | ✅ (Caddy) |
| Цена/мес | ~$5 | $0-7 | ~$3-5 | $5-10 (VPS) |
| Контроль | низкий | низкий | средний | полный |

---

## Полезные команды

```bash
# Локальная разработка (API + фронтенд вместе)
npm run dev

# Только API
npm run api

# Только фронтенд
cd frontend && npm run dev

# Пересобрать Docker локально
docker compose build app

# Обновить на VPS (базовый, без HTTPS)
docker compose pull && docker compose up -d

# Обновить на VPS (production, с Caddy + Watchtower)
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Логи приложения
docker compose logs -f app

# Логи Caddy
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy

# Запустить пайплайн (ingestion + indexing + digest)
# Через API:
curl -X POST http://localhost:3001/api/pipeline
```
