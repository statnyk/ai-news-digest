# AI News Digest — TODO

## Текущий статус

- [x] Frontend (React + Vite) — готов
- [x] Backend API (Express) — готов
- [x] GitHub Pages — деплоится автоматически (только фронтенд, без API)
- [x] Docker image `ghcr.io/statnyk/ai-news-digest:latest` — собирается при пуше в `main`
- [x] GitHub Actions — два workflow: Pages deploy + Docker build/push

## Известные проблемы

- **404/405 на GitHub Pages** — это нормально. GitHub Pages = статика, API там не работает. Решение: развернуть Docker на VPS (см. ниже)

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
