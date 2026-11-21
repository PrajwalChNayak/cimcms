# Runbook: Mosquitto hardening (HUMAN-ONLY)

Task: T4.3. Decisions: D-13 (Humidifier is monitor-only), D-14 (Mosquitto stays the existing host service, 8883 TLS listener added, 1883 kept until the Humidifier is migrated). Needs senior review before use.

**Who runs this:** a human operator with owner approval. No automated agent may run any step. Do not connect to the production server from any AI tool.

**Placeholders used below** (replace them yourself; never write real values into Git, chat, tickets or this file):

| Placeholder | Meaning |
|---|---|
| `<broker-host>` | Host name or IP of the existing broker server |
| `<domain>` | Your domain; the broker certificate name is `mqtt.<domain>` |
| `<ts>` | Timestamp used in backup names, for example `20250101-2200` |
| `<backend-password>`, `<device-password>` | Generated in a password manager. Never paste them anywhere else |
| `<conf-dir>`, `<passwd-file>`, `<acl-file>` | Real paths found in step 2 |

> **WARNING: the Humidifier uses the shared account `mqttuser`.** If the broker has no ACL today, enabling an ACL denies every topic that is not listed. The `mqttuser` block in step 6 is mandatory. If you enable the ACL without it, the Humidifier stops working. Do not skip it, do not narrow it, and do not remove it until step 12.

---

## 1. Agree a maintenance window

1. Agree a window with the owner, in a quiet hour.
2. Tell the owner in writing that the Humidifier could be affected if any step is wrong, and that you have a rollback ready (steps 3 and 11).
3. Have a second person available who can check the Humidifier physically or on its dashboard.

## 2. Record the current state

Run on the broker server (read-only commands). Save the output in your private notes, not in Git.

```bash
mosquitto -h 2>&1 | head -n 1                       # version
systemctl status mosquitto --no-pager
systemctl cat mosquitto                             # systemd unit and drop-ins
cat /etc/mosquitto/mosquitto.conf                   # adjust the path if different
ls -la /etc/mosquitto/ /etc/mosquitto/conf.d/       # include dirs
grep -RniE 'listener|per_listener_settings|password_file|acl_file|allow_anonymous|persistence|include_dir|cafile|certfile|keyfile' /etc/mosquitto/
ss -ltnp | grep mosquitto                           # listening ports
```

Write down: version, config file, include directories, password file path (`<passwd-file>`), ACL file path if any (`<acl-file>`), all listeners, whether `per_listener_settings` is set, and the systemd unit.

Observe what the Humidifier publishes and subscribes to (use a read-only account you already have; type the password at the prompt, not on the command line):

```bash
mosquitto_sub -h <broker-host> -p 1883 -u mqttuser -P '<mqttuser-password>' -t 'cimcms/humidifier/#' -v
mosquitto_sub -h <broker-host> -p 1883 -u mqttuser -P '<mqttuser-password>' -t '#' -v -W 120   # discover all topics for 2 minutes
```

Record every topic the Humidifier uses. If it uses topics outside `cimcms/humidifier/#`, that is fine for now because `mqttuser` keeps `readwrite #`, but write them down for step 12.

## 3. Back up config and write the rollback first

```bash
sudo mkdir -p /root/mosquitto-backup-<ts>
sudo cp -a /etc/mosquitto /root/mosquitto-backup-<ts>/etc-mosquitto
sudo cp -a <passwd-file> /root/mosquitto-backup-<ts>/passwd
[ -f <acl-file> ] && sudo cp -a <acl-file> /root/mosquitto-backup-<ts>/acl
sudo cp -a /var/lib/mosquitto /root/mosquitto-backup-<ts>/data 2>/dev/null || true
sudo ls -la /root/mosquitto-backup-<ts>
```

Write the rollback commands now, and keep them open in a second terminal:

```bash
# ROLLBACK (run if any verification in step 10 fails)
sudo systemctl stop mosquitto
sudo rm -rf /etc/mosquitto
sudo cp -a /root/mosquitto-backup-<ts>/etc-mosquitto /etc/mosquitto
sudo cp -a /root/mosquitto-backup-<ts>/passwd <passwd-file>
# Only if an ACL file existed before:
sudo cp -a /root/mosquitto-backup-<ts>/acl <acl-file>
sudo systemctl start mosquitto
systemctl status mosquitto --no-pager
```

Also copy the backup folder to an encrypted off-server location. It contains password hashes.

## 4. Test on a copy first

1. Start a local Mosquitto container of the same version as step 2 (replace `<version>`):
   ```bash
   mkdir -p ./mqtt-test/config ./mqtt-test/data
   cp <copied-conf> ./mqtt-test/config/mosquitto.conf     # copy of the production config
   docker run --rm -it -p 18883:8883 -p 11883:1883 \
     -v "$PWD/mqtt-test/config:/mosquitto/config" -v "$PWD/mqtt-test/data:/mosquitto/data" \
     eclipse-mosquitto:<version>
   ```
2. Apply steps 5 to 9 to the copy (use a self-signed certificate for the test listener).
3. Run all checks of step 10 against the container. Only continue when all pass.

## 5. Create accounts

Generate each password in a password manager. Never paste passwords into chat, tickets or Git. The `-c` flag creates or overwrites the file, so use it **only if the file does not exist**; never use `-c` on the existing production password file.

```bash
sudo mosquitto_passwd -b <passwd-file> cimcms-backend '<backend-password>'
sudo mosquitto_passwd -b <passwd-file> LED-01 '<device-password>'    # username = device ID
sudo chown mosquitto:mosquitto <passwd-file>
sudo chmod 640 <passwd-file>
```

Better, to keep the passwords out of shell history, run `sudo mosquitto_passwd <passwd-file> cimcms-backend` and type the password at the prompt.

Do not modify or remove the existing `mqttuser` entry.

Rollback for this step: `sudo mosquitto_passwd -D <passwd-file> cimcms-backend` and the same for `LED-01`, or restore the backup from step 3.

## 6. ACL file

**Read the warning at the top again.** If the broker has no ACL today, enabling one denies everything not listed. The `mqttuser` block below is mandatory or the Humidifier stops working.

If an ACL already exists, merge these blocks into it instead of replacing it, and keep every existing rule for the Humidifier.

Create `<acl-file>` (for example `/etc/mosquitto/acl`) with this content:

```
# Existing shared account used by the Humidifier. Keep full access until the Humidifier
# is reflashed with its own account. Then replace with exact topics and rotate the password.
user mqttuser
topic readwrite #

user cimcms-backend
topic read cimcms/led/+/status
topic read cimcms/led/+/telemetry
topic read cimcms/led/+/ack
topic read cimcms/led/+/event
topic write cimcms/led/+/command
topic write cimcms/led/+/config
topic read cimcms/humidifier/+/status
topic readwrite cimcms/backend/status

# Device accounts: username must equal the device ID
pattern write cimcms/led/%u/status
pattern write cimcms/led/%u/telemetry
pattern write cimcms/led/%u/ack
pattern write cimcms/led/%u/event
pattern read cimcms/led/%u/command
pattern read cimcms/led/%u/config
```

Then:

```bash
sudo chown mosquitto:mosquitto <acl-file>
sudo chmod 640 <acl-file>
```

Notes:

- The backend only reads Humidifier status (D-13). It must never publish to `cimcms/humidifier/...`.
- `pattern` lines apply to every authenticated user, with `%u` replaced by the username. A device account such as `LED-01` can only touch `cimcms/led/LED-01/...`.
- Add the line `acl_file <acl-file>` to the config only in step 7, and only after the file is complete and tested in step 4.

## 7. TLS listener on 8883

1. Obtain a certificate for `mqtt.<domain>` with Let's Encrypt (DNS record for `mqtt.<domain>` must already exist, created by you). Example with certbot standalone (port 80 must be free for the challenge, so coordinate with the web server, or use the DNS challenge instead):
   ```bash
   sudo certbot certonly --standalone -d mqtt.<domain>
   ```
2. Make the certificate readable by the broker without opening the private key to everyone. Example using a copy owned by `mosquitto` (refreshed by the hook in step 8):
   ```bash
   sudo mkdir -p /etc/mosquitto/certs
   sudo cp /etc/letsencrypt/live/mqtt.<domain>/fullchain.pem /etc/mosquitto/certs/fullchain.pem
   sudo cp /etc/letsencrypt/live/mqtt.<domain>/privkey.pem   /etc/mosquitto/certs/privkey.pem
   sudo chown -R mosquitto:mosquitto /etc/mosquitto/certs
   sudo chmod 640 /etc/mosquitto/certs/privkey.pem
   ```
3. Edit the config (for example `/etc/mosquitto/conf.d/cimcms.conf`). Merge with what exists; do not duplicate options that are already set.
   ```
   # Existing listener, kept for the Humidifier until it is migrated
   listener 1883

   # New TLS listener
   listener 8883
   certfile /etc/mosquitto/certs/fullchain.pem
   keyfile  /etc/mosquitto/certs/privkey.pem

   allow_anonymous false
   password_file <passwd-file>
   acl_file <acl-file>
   persistence true
   ```
   - Do **not** enable `per_listener_settings` unless it is already on. Turning it on changes how auth settings apply (each listener then needs its own `password_file`, `acl_file`, `allow_anonymous`).
   - If `per_listener_settings true` is already set, repeat `allow_anonymous`, `password_file` and `acl_file` under each `listener` block.
   - Make sure `persistence true` and a valid `persistence_location` are set, so the backend persistent session survives a broker restart.
4. Check the syntax of the config before applying: start the test container (step 4) with the same file, or run `mosquitto -c <conf-file> -v` on a spare port on a copy.

Rollback for this step: restore the config from step 3 and restart (see step 3).

## 8. Certificate renewal hook

1. Create `/etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh`:
   ```bash
   #!/bin/sh
   set -e
   cp /etc/letsencrypt/live/mqtt.<domain>/fullchain.pem /etc/mosquitto/certs/fullchain.pem
   cp /etc/letsencrypt/live/mqtt.<domain>/privkey.pem   /etc/mosquitto/certs/privkey.pem
   chown mosquitto:mosquitto /etc/mosquitto/certs/*.pem
   chmod 640 /etc/mosquitto/certs/privkey.pem
   systemctl restart mosquitto
   ```
   ```bash
   sudo chmod 750 /etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh
   ```
2. **Verify on the installed version** whether `SIGHUP` (`systemctl reload mosquitto`) reloads the certificate. Do not assume it does. Test it on the container from step 4: renew or swap the test certificate, send `SIGHUP`, then check the served certificate with `openssl s_client`. If it does not reload, keep `restart` in the hook.
3. A restart disconnects every client briefly (the Humidifier and the LED devices reconnect, the backend reconnects with its persistent session). Schedule renewal and restart in a quiet hour: renew only inside the maintenance schedule agreed with the owner, for example by running `certbot renew` from a timer at that hour instead of the default timer.
4. Test the hook:
   ```bash
   sudo certbot renew --dry-run
   ```
   A dry run does not run deploy hooks. To test the hook script itself, run it by hand during the window: `sudo /etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh`.
5. Put a reminder in the owner calendar for the certificate expiry (90 days) and for checking that the last renewal worked.

Rollback for this step: `sudo rm /etc/letsencrypt/renewal-hooks/deploy/mosquitto.sh`.

## 9. Firewall

Commands shown for `ufw`; use the equivalent if the server uses `nftables`, `firewalld` or a cloud firewall.

```bash
sudo ufw status numbered                       # record current rules first
sudo ufw allow 8883/tcp comment 'MQTT TLS'
```

Port 1883:

- Ask the owner whether the facility has a **static public IP**.
- If yes, restrict 1883 to that IP:
  ```bash
  sudo ufw allow from <facility-public-ip> to any port 1883 proto tcp
  sudo ufw delete allow 1883/tcp                # only after confirming the Humidifier still connects
  ```
- If no, leave 1883 open and **record the risk** in the owner handover (plain-text MQTT, shared account `mqttuser` with full access).
- Make sure the cloud provider firewall or security group also allows 8883.

Rollback for this step: `sudo ufw delete allow 8883/tcp` and re-add `sudo ufw allow 1883/tcp` if you removed it.

## 10. Apply, reload and verify

1. Apply:
   ```bash
   sudo systemctl restart mosquitto        # a restart is needed to add a listener and the ACL
   systemctl status mosquitto --no-pager
   sudo journalctl -u mosquitto -n 50 --no-pager
   ss -ltn | grep -E ':(1883|8883)'
   ```
2. Verify. All of the following must pass. Type passwords at the prompt where possible.

   a. **Humidifier status still arrives** on `cimcms/humidifier/<id>/status` (it uses `mqttuser` on 1883):
   ```bash
   mosquitto_sub -h <broker-host> -p 1883 -u mqttuser -P '<mqttuser-password>' -t 'cimcms/humidifier/+/status' -v -W 120
   ```
   Also have the second person confirm the Humidifier itself still works.

   b. **Backend account can read LED topics** over TLS (and the Humidifier status):
   ```bash
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u cimcms-backend -P '<backend-password>' -t 'cimcms/led/+/status' -v -W 30
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u cimcms-backend -P '<backend-password>' -t 'cimcms/humidifier/+/status' -v -W 30
   ```
   And it must **not** be able to publish to the Humidifier (publish is silently dropped by the broker; confirm with a subscriber using `mqttuser` that nothing arrives on a harmless test topic such as `cimcms/humidifier/TEST/command`, then do not repeat this on a real Humidifier ID).

   c. **`LED-01` cannot write to another device**. In terminal 1 subscribe as the backend:
   ```bash
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u cimcms-backend -P '<backend-password>' -t 'cimcms/led/+/status' -v
   ```
   In terminal 2 publish as `LED-01`:
   ```bash
   mosquitto_pub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u LED-01 -P '<device-password>' -t 'cimcms/led/LED-02/status' -m '{"test":true}'   # must NOT appear in terminal 1
   mosquitto_pub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u LED-01 -P '<device-password>' -t 'cimcms/led/LED-01/status' -m '{"test":true}'   # must appear in terminal 1
   ```
   Do not publish test payloads that the backend could treat as a real device status. If the backend is already running, use a spare topic suffix or stop the backend first.

   d. **Anonymous connection is refused**:
   ```bash
   mosquitto_sub -h <broker-host> -p 1883 -t '#' -W 5       # must fail: Connection Refused: not authorised
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -t '#' -W 5   # must fail
   ```

   e. **TLS certificate** is valid:
   ```bash
   openssl s_client -connect mqtt.<domain>:8883 -servername mqtt.<domain> </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
   ```

3. Watch the broker log for 10 to 15 minutes for unexpected `not authorised` or ACL denials from the Humidifier:
   ```bash
   sudo journalctl -u mosquitto -f
   ```

## 11. Rollback if any verification fails

If any check in step 10 fails, or the Humidifier misbehaves in any way, roll back immediately. Do not debug on the live broker during the window.

```bash
sudo systemctl stop mosquitto
sudo rm -rf /etc/mosquitto
sudo cp -a /root/mosquitto-backup-<ts>/etc-mosquitto /etc/mosquitto
sudo cp -a /root/mosquitto-backup-<ts>/passwd <passwd-file>
[ -f /root/mosquitto-backup-<ts>/acl ] && sudo cp -a /root/mosquitto-backup-<ts>/acl <acl-file>
sudo systemctl start mosquitto
sudo ufw delete allow 8883/tcp 2>/dev/null || true     # if you added it
# If you changed 1883 rules in step 9, restore the rules you recorded.
```

Then verify the Humidifier works again (step 10, check a), tell the owner, and diagnose on the test container.

## 12. After the Humidifier is migrated (owner decision O-12)

Do this only when the owner confirms the Humidifier firmware has been reflashed to use TLS on 8883 and its own account. Until then, keep 1883 and the `mqttuser` block unchanged.

1. Create the Humidifier account (password from the password manager):
   ```bash
   sudo mosquitto_passwd <passwd-file> humidifier-<id>
   ```
2. Narrow its ACL to the exact topics recorded in step 2, for example (adjust to what the Humidifier really uses):
   ```
   user humidifier-<id>
   topic readwrite cimcms/humidifier/<id>/#
   ```
3. Test that the Humidifier works on 8883 with the new account while `mqttuser` still exists.
4. Remove the `mqttuser` block from the ACL and delete or rotate the account:
   ```bash
   sudo mosquitto_passwd -D <passwd-file> mqttuser        # or set a new random password with mosquitto_passwd
   sudo systemctl restart mosquitto
   ```
5. Close port 1883: remove the `listener 1883` block and the firewall rule:
   ```bash
   sudo ufw delete allow 1883/tcp
   ```
6. Re-run the verifications of step 10 (without the `mqttuser` check) and confirm that anonymous connections are refused.
7. Update the owner handover record and the backup of the broker config (see `docs/runbooks/backup-restore.md`).

Rollback for this step: restore the previous config, ACL and password file from a backup made at the start of this step, restart Mosquitto, and re-add the 1883 firewall rule.

---

## Final checklist

- [ ] Window agreed, second person present
- [ ] Current state recorded (step 2)
- [ ] Backups made and copied off-server; rollback ready (step 3)
- [ ] All steps tested on a same-version container (step 4)
- [ ] Accounts created, no passwords in chat or Git (step 5)
- [ ] ACL includes the `mqttuser` block (step 6)
- [ ] 8883 TLS listener works, 1883 still works for the Humidifier (step 7)
- [ ] Renewal hook tested, reload vs restart verified (step 8)
- [ ] Firewall done, risk recorded if 1883 stays open (step 9)
- [ ] All verifications passed (step 10), or rollback done (step 11)
- [ ] Owner reviewed this runbook and the result
