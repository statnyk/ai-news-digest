#!/bin/bash
# Creates the dedicated n8n database when Postgres starts with an empty data dir.
# Idempotent: safe to run again (e.g. after adding this script to an existing stack).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'n8n') THEN
    CREATE DATABASE n8n;
  END IF;
END
\$\$;
"
