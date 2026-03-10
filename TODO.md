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

### 2. Reverse proxy + HTTPS (опционально)

- [ ] Настроить Nginx или Caddy перед портом 3001
- [ ] Получить SSL сертификат (Let's Encrypt / Caddy auto-HTTPS)
- [ ] Привязать домен

### 3. Связать GitHub Pages с бэкендом (опционально)

- [ ] Добавить GitHub Secret `VITE_API_URL=https://your-domain.com`
- [ ] Обновить `.github/workflows/deploy.yml` — передать `VITE_API_URL` при билде фронтенда
- [ ] После этого GitHub Pages будет работать с удалённым API

### 4. Авто-обновление на VPS (опционально)

- [ ] Настроить Watchtower для автоматического pull новых образов
- [ ] Или добавить GitHub Actions step с SSH deploy после push образа

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

# Обновить на VPS
docker compose pull && docker compose up -d

# Логи приложения
docker compose logs -f app

# Запустить пайплайн (ingestion + indexing + digest)
# Через API:
curl -X POST http://localhost:3001/api/pipeline
```
