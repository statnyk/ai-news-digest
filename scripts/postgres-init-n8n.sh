#!/bin/bash
# Creates the dedicated n8n database when Postgres starts with an empty data dir.
# Used by docker-compose on the n8n branch so n8n does not share the app DB.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -c "CREATE DATABASE n8n;"
