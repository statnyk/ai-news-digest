# n8n Production: "Migrations failed. Check database configuration."

This error means n8n cannot run its **internal** database migrations (where it stores workflows, executions, credentials). It is unrelated to the app’s PostgreSQL (articles/topics).

## Fix checklist

### 1. Set n8n’s database environment variables

n8n needs its **own** DB config. Set these on the **n8n** service (or process), not only on the app:

| Variable | Example | Required |
|----------|---------|----------|
| `DB_TYPE` | `postgresdb` | Yes |
| `DB_POSTGRESDB_HOST` | Hostname of PostgreSQL | Yes |
| `DB_POSTGRESDB_PORT` | `5432` | Yes |
| `DB_POSTGRESDB_DATABASE` | `n8n` (recommended) or your DB name | Yes |
| `DB_POSTGRESDB_USER` | PostgreSQL user | Yes |
| `DB_POSTGRESDB_PASSWORD` | PostgreSQL password | Yes |

- Use a **dedicated database** for n8n (e.g. `n8n`) so its tables are separate from the app. Create it if needed: `CREATE DATABASE n8n;`
- The PostgreSQL user must be able to **create objects** (tables, extensions like `uuid-ossp`). Recommended: `GRANT ALL PRIVILEGES ON DATABASE n8n TO your_n8n_user;`

### 2. Railway (or other cloud)

- Point `DB_POSTGRESDB_HOST` (and port/user/password) to the **PostgreSQL service** that n8n should use (e.g. Railway Postgres internal hostname).
- If n8n runs in the same project as Postgres, use the **internal** hostname (e.g. `postgres.railway.internal` or the hostname from the Postgres service variables).
- If TLS is required and you see certificate errors, try:
  - `DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false`
- Ensure the database exists. On Railway you can create a second database in the same Postgres instance via SQL (e.g. in Railway’s SQL tab or a one-off run): `CREATE DATABASE n8n;`

### 3. Docker Compose (n8n branch)

The repo’s `docker-compose.yml` on the **n8n** branch configures n8n to use a dedicated database `n8n`. On first run, an init script creates that database. If you already have existing Postgres data and never ran the init script, create the DB manually:

```bash
docker exec -it ai-news-postgres psql -U postgres -c "CREATE DATABASE n8n;"
```

Then restart the n8n service.

### 4. n8n Cloud

If you use **n8n Cloud** (e.g. `statnyk.app.n8n.cloud`), the database is managed by n8n. “Migrations failed” there usually means an outage or a problem on n8n’s side. Check [n8n status](https://status.n8n.io) and your plan’s DB settings; contact n8n support if it persists.

## Reference (n8n docs)

- [Supported databases and settings](https://docs.n8n.io/hosting/configuration/supported-databases-settings/)
