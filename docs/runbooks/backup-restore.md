# Runbook: backup and restore (T4.4)

Scope: the production MongoDB (compose service `mongo`, database `cimcms`), plus the files that are not in Git: Mosquitto config, ACL and password files, and `/opt/cimcms/secrets`.

Scripts: `infra/prod/scripts/backup-mongo.sh`, `infra/prod/scripts/restore-mongo.sh`. They run on the server, use `docker compose exec` on the `mongo` service and read the root credentials from inside the container, so no password appears on a command line or in the scripts.

Placeholders: `<repo>` = the checkout on the server (for example `/opt/cimcms/repo`), `<scratch-host>` = a throwaway server or VM.

## 1. What is backed up

| Item | How | Where it lives |
|---|---|---|
| MongoDB `cimcms` (including the telemetry time-series collection) | `backup-mongo.sh` (`mongodump --archive --gzip`) | `/var/backups/cimcms/` |
| Mosquitto config, ACL, passwd, `/var/lib/mosquitto` | manual / your own cron, see section 5 | encrypted store |
| `/opt/cimcms/secrets` (`api.env`, `mongo.env`, `mongo-keyfile`) | manual, see section 5 | encrypted store ONLY |
| Let's Encrypt (`/etc/letsencrypt`) | optional; certificates can be re-issued | - |

Retention: newest 14 daily archives in `/var/backups/cimcms/` and newest 8 weekly archives (Sunday copies) in `/var/backups/cimcms/weekly/`. Archives are mode 600 (umask 077).

> TODO(owner-decision O-13): off-server destination. Until the owner names one, backups sit on the same server and do **not** survive loss of that server. Once chosen, set `OFFSITE_CMD` (for example `rsync -a --`/`rclone copyto` wrapper; it is called as `$OFFSITE_CMD <archive-path>`) in the cron line below. Encrypt before upload if the destination is not under the owner's control.

## 2. Schedule (cron)

As the deploy user (member of the `docker` group):

```bash
sudo install -d -m 700 -o <deploy-user> /var/backups/cimcms
crontab -e
```

```cron
# 02:00 daily; compose reads infra/prod/.env for DOMAIN/CIMCMS_TAG, so run from that directory
0 2 * * * cd <repo>/infra/prod && ./scripts/backup-mongo.sh >> /var/log/cimcms-backup.log 2>&1
```

(`cd` matters: `docker compose` needs the same `.env` as the running stack.) Create `/var/log/cimcms-backup.log` writable by the deploy user, or log to `~/cimcms-backup.log`.

Run once by hand after install and check:

```bash
cd <repo>/infra/prod && ./scripts/backup-mongo.sh
ls -la /var/backups/cimcms/
gzip -t /var/backups/cimcms/mongo-$(date +%F).archive.gz && echo archive ok
```

Check monthly that the newest archive is recent and its size is plausible. A failed run exits non-zero and writes to the log; wire the log or exit status into whatever alerting the owner has.

## 3. Restore

> `--drop` replaces live data. Always take a fresh backup first (section 2 command). Stop the API so nothing writes during the restore: `docker compose stop api`.

### 3.1 Restore into the live database (disaster recovery)

```bash
cd <repo>/infra/prod
docker compose stop api
./scripts/backup-mongo.sh                         # safety copy of the current state
./scripts/restore-mongo.sh /var/backups/cimcms/mongo-<YYYY-MM-DD>.archive.gz --drop
docker compose start api
curl -fsS https://<domain>/api/health/ready       # after T2.10 provides the endpoint
```

The script asks you to type the target database name unless `--yes` is given.

### 3.2 Restore into a scratch database on the same instance (inspect without risk)

```bash
TARGET_DB=cimcms_restore_check ./scripts/restore-mongo.sh /var/backups/cimcms/mongo-<YYYY-MM-DD>.archive.gz --drop
docker compose exec -T mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.getSiblingDB(\"cimcms_restore_check\").getCollectionNames()"'
# when finished:
docker compose exec -T mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.getSiblingDB(\"cimcms_restore_check\").dropDatabase()"'
```

### 3.3 Restore on a new server

Install per `docs/runbooks/deploy.md` up to and including `docker compose up -d mongo` (restore secrets from the encrypted store first: the Mongo root credentials and keyfile in `mongo.env` / `mongo-keyfile` must match `api.env`). Then run 3.1 with the archive copied from off-server, then `docker compose up -d`.

## 4. Quarterly restore drill (on `<scratch-host>`, never on production)

1. Bring up a scratch server or VM with Docker; follow `deploy.md` to the point of a running `mongo` service with throwaway secrets (not the production ones).
2. Copy the latest off-server archive there.
3. Restore (3.1) and compare document counts for the key collections with the numbers recorded at backup time, for example:
   ```bash
   docker compose exec -T mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin cimcms --eval "db.getCollectionNames().forEach(c=>print(c, db.getCollection(c).countDocuments()))"'
   ```
   (The telemetry collection is a time-series collection; its count is queried the same way.)
4. Start the API against the restored data and log in. Record the date, archive name, counts and who did it. If any step fails, fix the procedure and repeat.
5. Destroy the scratch server and its disks.

Local verification done when the scripts were written (dev Mongo, scratch database, no production access): a database with a plain collection (25 docs) and a time-series collection (100 docs) was dumped from the dev container and restored into an empty `mongo:7` container, both under the same name and renamed with `TARGET_DB`; counts matched (25 / 100) and the time-series type was preserved.

## 5. Other things to back up (manual, encrypted)

Do this after any change, and at least monthly. Use an encrypted store the owner controls (password-manager attachment, encrypted archive on separate storage). Never put these in Git, chat or tickets.

```bash
umask 077
ts=$(date +%Y%m%d-%H%M)
# CIMCMS secrets (api.env, mongo.env, mongo-keyfile)
sudo tar -C /opt/cimcms -czf - secrets | gpg --symmetric --cipher-algo AES256 -o /root/cimcms-secrets-$ts.tar.gz.gpg
# Mosquitto (broker host): config, ACL, passwd, persistence
sudo tar -czf - /etc/mosquitto /var/lib/mosquitto | gpg --symmetric --cipher-algo AES256 -o /root/mosquitto-$ts.tar.gz.gpg
```

Then move the `.gpg` files off the server. The passphrase goes in the password manager. `docs/runbooks/mosquitto-hardening.md` step 3 already takes a timestamped backup before changes; this is the routine copy.

Keep the original `mongo.env` and `mongo-keyfile`: the root credentials and the replica-set keyfile belong to the `mongo-data` volume, and `api.env` must match them.
