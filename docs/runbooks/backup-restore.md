# Runbook: backup and restore (T4.4)

Scope: the production PostgreSQL database (compose service `postgres`, database `cimcms`), plus the files that are not in Git: Mosquitto config, ACL and password files, and `/opt/cimcms/secrets`.

Scripts: `infra/prod/scripts/backup-postgres.sh`, `infra/prod/scripts/restore-postgres.sh`. They run on the server, use `docker compose exec` on the `postgres` service and read the credentials from inside the container (`postgres.env`), so no password appears on a command line or in the scripts.

Placeholders: `<repo>` = the checkout on the server (for example `/opt/cimcms/repo`), `<scratch-host>` = a throwaway server or VM.

## 1. What is backed up

| Item | How | Where it lives |
|---|---|---|
| PostgreSQL `cimcms` (all tables, including telemetry and the `_prisma_migrations` history) | `backup-postgres.sh` (`pg_dump --format=custom`) | `/var/backups/cimcms/` |
| Mosquitto config, ACL, passwd, `/var/lib/mosquitto` | manual / your own cron, see section 5 | encrypted store |
| `/opt/cimcms/secrets` (`api.env`, `postgres.env`) | manual, see section 5 | encrypted store ONLY |
| Let's Encrypt (`/etc/letsencrypt`) | optional; certificates can be re-issued | - |

Retention: newest 14 daily dumps in `/var/backups/cimcms/` and newest 8 weekly dumps (Sunday copies) in `/var/backups/cimcms/weekly/`. Dumps are mode 600 (umask 077). Each dump is checked with `pg_restore --list` before it replaces the partial file.

> TODO(owner-decision O-13): off-server destination. Until the owner names one, backups sit on the same server and do **not** survive loss of that server. Once chosen, set `OFFSITE_CMD` (for example an `rsync -a --` / `rclone copyto` wrapper; it is called as `$OFFSITE_CMD <dump-path>`) in the cron line below. Encrypt before upload if the destination is not under the owner's control.

## 2. Schedule (cron)

As the deploy user (member of the `docker` group):

```bash
sudo install -d -m 700 -o <deploy-user> /var/backups/cimcms
crontab -e
```

```cron
# 02:00 daily; compose reads infra/prod/.env for DOMAIN/CIMCMS_TAG, so run from that directory
0 2 * * * cd <repo>/infra/prod && ./scripts/backup-postgres.sh >> /var/log/cimcms-backup.log 2>&1
```

(`cd` matters: `docker compose` needs the same `.env` as the running stack.) Create `/var/log/cimcms-backup.log` writable by the deploy user, or log to `~/cimcms-backup.log`.

Run once by hand after install and check:

```bash
cd <repo>/infra/prod && ./scripts/backup-postgres.sh
ls -la /var/backups/cimcms/
docker compose exec -T postgres pg_restore --list < /var/backups/cimcms/postgres-$(date +%F).dump > /dev/null && echo dump ok
```

Check monthly that the newest dump is recent and its size is plausible. A failed run exits non-zero and writes to the log; wire the log or exit status into whatever alerting the owner has.

## 3. Restore

> Restoring drops and re-creates the target database. Always take a fresh backup first (section 2 command). Stop the API so nothing writes during the restore: `docker compose stop api`.

### 3.1 Restore into the live database (disaster recovery)

```bash
cd <repo>/infra/prod
docker compose stop api
./scripts/backup-postgres.sh                      # safety copy of the current state
TARGET_DB=cimcms ./scripts/restore-postgres.sh /var/backups/cimcms/postgres-<YYYY-MM-DD>.dump
docker compose start api                          # the entrypoint applies any newer migrations
docker compose exec api curl -fsS http://localhost:3814/health/ready
```

The script asks you to type the target database name unless `--yes` is given. If the dump comes from an older release, starting the current api image applies the missing migrations on top of it.

### 3.2 Restore into a scratch database on the same instance (inspect without risk)

```bash
./scripts/restore-postgres.sh /var/backups/cimcms/postgres-<YYYY-MM-DD>.dump     # default TARGET_DB=cimcms_restore_check
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d cimcms_restore_check -c "\dt"'
# when finished:
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE cimcms_restore_check"'
```

### 3.3 Restore on a new server

Install per `docs/runbooks/deploy.md` up to and including `docker compose up -d postgres` (restore the secrets from the encrypted store first: `postgres.env` and `DATABASE_URL` in `api.env` must match). Then run 3.1 with the dump copied from off-server, then `docker compose up -d`.

## 4. Quarterly restore drill (on `<scratch-host>`, never on production)

1. Bring up a scratch server or VM with Docker; follow `deploy.md` to the point of a running `postgres` service with throwaway secrets (not the production ones).
2. Copy the latest off-server dump there.
3. Restore (3.1) and compare row counts of the key tables with the numbers recorded at backup time, for example:
   ```bash
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d cimcms -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname"'
   ```
   (`n_live_tup` is an estimate; use `SELECT count(*)` on a table for an exact number.)
4. Start the API against the restored data and log in. Record the date, dump name, counts and who did it. If any step fails, fix the procedure and repeat.
5. Destroy the scratch server and its disks.

Local verification (2026-11-22, dev Postgres container, no production access): `backup-postgres.sh` dumped the dev `cimcms` database (54 KB), `restore-postgres.sh` restored it into `cimcms_restore_check`, and the migration history table was present after the restore.

## 5. Other things to back up (manual, encrypted)

Do this after any change, and at least monthly. Use an encrypted store the owner controls (password-manager attachment, encrypted archive on separate storage). Never put these in Git, chat or tickets.

```bash
umask 077
ts=$(date +%Y%m%d-%H%M)
# CIMCMS secrets (api.env, postgres.env)
sudo tar -C /opt/cimcms -czf - secrets | gpg --symmetric --cipher-algo AES256 -o /root/cimcms-secrets-$ts.tar.gz.gpg
# Mosquitto (broker host): config, ACL, passwd, persistence
sudo tar -czf - /etc/mosquitto /var/lib/mosquitto | gpg --symmetric --cipher-algo AES256 -o /root/mosquitto-$ts.tar.gz.gpg
```

Then move the `.gpg` files off the server. The passphrase goes in the password manager. `docs/runbooks/mosquitto-hardening.md` step 3 already takes a timestamped backup before changes; this is the routine copy.

Keep the original `postgres.env`: the database password belongs to the `postgres-data` volume (it is set only when the volume is first created), and `DATABASE_URL` in `api.env` must match it.
