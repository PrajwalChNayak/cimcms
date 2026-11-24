-- Creates the broker database (apps/broker: tables MqttAccount, MqttRetained) next to the
-- application database (POSTGRES_DB, default cimcms) in the same postgres container.
-- Mounted to /docker-entrypoint-initdb.d by infra/prod/docker-compose.yml. Postgres runs it ONLY
-- when the data volume is empty (first start). On an existing volume, create it by hand:
--   docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE cimcms_broker"'
-- The tables are created by the broker container (prisma migrate deploy) when it starts.
CREATE DATABASE cimcms_broker;
