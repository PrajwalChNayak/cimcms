# Runbook: Mosquitto hardening (HUMAN-ONLY)

> **Superseded (2026-11-24, PROGRESS D26).** CIMCMS now runs its own MQTT broker (`apps/broker`); logins live in the database table `MqttAccount`. Use [broker.md](broker.md) for operations and `infra/server-broker/README.md` for the switch-over from Mosquitto. This runbook is kept only for rollback to Mosquitto and as history.

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
| `<dynsec-admin-password>` | Dynamic Security admin password (step 13), generated in a password manager. Stored only there, in `api.env` and in the encrypted secrets store |
| `<plugin-path>`, `<dynsec-file>` | Dynamic Security plugin library and its state file, found or chosen in step 13.3 |

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

## 13. Automatic device accounts (Dynamic Security plugin)

**HUMAN-ONLY, optional.** Do this only when the owner wants the web app to create device broker accounts automatically, and only after steps 1 to 11 are done and the 8883 TLS listener works. Until then keep `MQTT_PROVISIONING=manual` in `api.env` (the default). In that mode the broker needs no change: an operator creates each device account as in step 5, and the web app shows those manual steps for each new device.

**What it does.** Mosquitto's Dynamic Security plugin keeps its own list of users and roles in a JSON file, and an admin account can change them by sending MQTT messages. With `MQTT_PROVISIONING=dynsec` the CIMCMS API uses that admin account whenever an admin adds a device in the web app: it creates one broker user per device (user name = client ID = device ID) with its own role `cimcms-device-<deviceId>`. That role only allows publishing `cimcms/<type>/<deviceId>/status`, `telemetry`, `ack` and `event`, and subscribing to and receiving `cimcms/<type>/<deviceId>/command` and `config`. The random password is shown once in the web app; only the broker keeps its hash. Reset password and device deletion in the web app change the broker account too.

The plugin only answers for users it knows. Every other user (`mqttuser`, `cimcms-backend`, `LED-01` and other devices from step 5) is still checked against `password_file` and `acl_file`, so **both files stay in place**. This was verified on a dev broker (eclipse-mosquitto 2.1.2); verify it again on your version in step 13.2.

### 13.1 Back up first

Make a fresh backup exactly as in step 3, with a new `<ts>` (config, password file, ACL, data directory), and copy it off-server. Keep the step 3 rollback commands open in a second terminal.

### 13.2 Test on a copy first

As in step 4: start a local container of the **same Mosquitto version** as the production broker, with copies of the current production config, password file and ACL. The plugin needs Mosquitto 2.0 or later; in the official `eclipse-mosquitto` image it is at `/usr/lib/mosquitto_dynamic_security.so`. Apply steps 13.3 to 13.6 to the copy and run the checks of step 13.7 against it, including that `mqttuser`, `cimcms-backend` and `LED-01` still connect and keep their access. Only continue when all checks pass.

### 13.3 Find the plugin and choose the state file

Run on the broker server (read-only):

```bash
mosquitto -h 2>&1 | head -n 1                               # must be 2.0 or later
find / -name 'mosquitto_dynamic_security.so' 2>/dev/null    # the result is <plugin-path>
```

On Debian and Ubuntu packages it is usually `/usr/lib/x86_64-linux-gnu/mosquitto_dynamic_security.so`. If nothing is found, the installed package does not include the plugin: stop here and keep `MQTT_PROVISIONING=manual`.

Choose `<dynsec-file>` in the broker's data directory, for example `/var/lib/mosquitto/dynamic-security.json`. The broker rewrites this file every time an account changes, so the `mosquitto` user must own it.

### 13.4 Initialise the plugin with an admin account

1. Generate a strong admin password in the password manager (`<dynsec-admin-password>`).
2. Check that `<dynsec-file>` does not exist yet (`sudo ls -la <dynsec-file>` must say "No such file"). Never delete or re-initialise an existing file: it holds every automatic device account.
3. Create the file. Leave the password off the command line; `mosquitto_ctrl` asks for it, which keeps it out of the shell history:
   ```bash
   sudo mosquitto_ctrl dynsec init <dynsec-file> cimcms-admin
   sudo chown mosquitto:mosquitto <dynsec-file>
   sudo chmod 600 <dynsec-file>
   ```
4. Store the admin password in the encrypted secrets store (`docs/runbooks/backup-restore.md` section 5). It goes into `api.env` in step 13.7 and nowhere else.

The admin account can create, change and delete any broker account in the plugin, and the role that `init` gives it can also read broker topics (after step 13.7 item 3, look at it with `dynsec getClient cimcms-admin` and then `dynsec getRole <role-name>`). Treat it like a root password: never give it to a device, the Humidifier, or anyone's everyday MQTT client.

Rollback for this step: the file is not used until step 13.5. To undo, delete only the file you just created in this step.

### 13.5 Add the plugin to the broker config

Edit the same config file as in step 7 (for example `/etc/mosquitto/conf.d/cimcms.conf`). Add the two plugin lines and **keep `password_file` and `acl_file` exactly as they are**:

```
# Dynamic Security plugin: automatic device accounts created by the CIMCMS API.
# Users it does not know (mqttuser, cimcms-backend, file-based devices) are still
# checked against password_file and acl_file below. Do not remove those lines.
plugin <plugin-path>
plugin_opt_config_file <dynsec-file>

password_file <passwd-file>
acl_file <acl-file>
```

- Without `per_listener_settings` (the normal case, see step 7) the plugin applies to all listeners.
- If `per_listener_settings true` is already set, plugins are configured per listener. Check the documentation of your installed version and test it on the copy (step 13.2) before touching production.
- Do not create a file-based account (step 5) for a device that already has an automatic account, or the other way round. The plugin answers first for users it knows, so the file entry would be ignored.

### 13.6 Keep the admin account off plain-text connections

Device passwords travel inside the admin messages from the API to the broker. The admin account must only be used over one of these:

- the 8883 TLS listener: `MQTT_URL=mqtts://<broker-host>:8883` in `api.env` (the API's admin connection uses `MQTT_URL` and `MQTT_CA_FILE`), or
- a listener that is reachable only from the broker host or the private network, for example `listener 1884 127.0.0.1` (or the server's private IP), when the API runs on the same host or private network. Do not open such a port in the firewall.

Never use `cimcms-admin` over the public plain-text 1883 listener. Mosquitto cannot limit one user to one listener unless `per_listener_settings` is on, so this is enforced by how the API and the operators are configured; the 1883 firewall restriction from step 9 reduces the exposure further. Running `mosquitto_ctrl` on the broker host itself against `localhost` is fine, because that traffic does not leave the machine.

### 13.7 Apply, configure the API and verify

1. Apply:
   ```bash
   sudo systemctl restart mosquitto        # the plugin is loaded only at start
   systemctl status mosquitto --no-pager
   sudo journalctl -u mosquitto -n 50 --no-pager   # no errors about the plugin or <dynsec-file>
   ```
2. **Existing accounts still work.** Re-run step 10, checks a (Humidifier on 1883 with `mqttuser`, and the second person confirms the Humidifier itself), b (`cimcms-backend`) and c (`LED-01`). All must pass exactly as before. If any fails, roll back (step 13.9).
3. **The admin account works over TLS:**
   ```bash
   mosquitto_ctrl -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u cimcms-admin -P '<dynsec-admin-password>' dynsec listClients
   ```
   Expected: only `cimcms-admin` (device accounts appear here once the API creates them).
4. **Configure the API.** In `/opt/cimcms/secrets/api.env` set:
   ```
   MQTT_PROVISIONING=dynsec
   MQTT_ADMIN_USERNAME=cimcms-admin
   MQTT_ADMIN_PASSWORD=<dynsec-admin-password>
   MQTT_DEVICE_URL=mqtts://mqtt.<domain>:8883
   ```
   Check that `MQTT_URL` is the TLS listener or a private listener (step 13.6). Then recreate the api container so it re-reads the env file (a plain `restart` does not):
   ```bash
   cd <repo>/infra/prod && docker compose up -d api
   docker compose logs --tail 50 api
   ```
   The release must contain the migration `20261123115752_device_mqtt_account`; the api container applies it at start.
5. **Add a test device.** In the web app go to Devices → Add device, for example ID `TEST-DYNSEC-01`, type LED controller. The web app shows the user name, client ID, password (once) and the topics. Use the password only for this test.
6. **Connect with its credentials.** In terminal 1 subscribe as the backend:
   ```bash
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -u cimcms-backend -P '<backend-password>' -t 'cimcms/led/+/status' -v
   ```
   In terminal 2 publish as the test device. The client ID must equal the device ID, so pass `-i`:
   ```bash
   mosquitto_pub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -i TEST-DYNSEC-01 -u TEST-DYNSEC-01 -P '<test-device-password>' -t 'cimcms/led/TEST-DYNSEC-01/status' -m '{"test":true}'   # must appear in terminal 1
   mosquitto_pub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -i TEST-DYNSEC-01 -u TEST-DYNSEC-01 -P '<test-device-password>' -t 'cimcms/led/NOT-A-DEVICE/status' -m '{"test":true}'     # must NOT appear in terminal 1
   mosquitto_sub -h mqtt.<domain> -p 8883 --capath /etc/ssl/certs -i TEST-DYNSEC-01 -u TEST-DYNSEC-01 -P 'wrong-password' -t 'cimcms/led/TEST-DYNSEC-01/command' -W 5   # must fail: not authorised
   ```
   Do not publish test payloads to the topics of a real device.
7. **Delete the test device** in the web app. Then run the `listClients` command from item 3 again: `TEST-DYNSEC-01` must be gone, and connecting with its password must now fail.
8. Watch the broker log for 10 to 15 minutes, as in step 10.3, for unexpected `not authorised` messages or ACL denials from the Humidifier, `cimcms-backend` or the LED devices.

### 13.8 Back up the Dynamic Security state

`<dynsec-file>` holds the admin account and every automatic device account (password hashes). It changes each time an admin adds a device, resets a password or deletes a device, so it must be backed up **together with the broker config and password file**, encrypted and off-server, and the backup must be refreshed regularly (`docs/runbooks/backup-restore.md`). Step 3 copies `/var/lib/mosquitto`; if `<dynsec-file>` lives elsewhere, copy it as well. The CIMCMS database does not contain the device passwords, so it cannot replace this backup.

If the file is ever restored from an older backup, devices added after that backup cannot connect. Use Reset password on each of those devices in the web app (it re-creates a missing account) and load the new password onto the device.

### 13.9 Rollback

1. Set `MQTT_PROVISIONING=manual` in `/opt/cimcms/secrets/api.env` and run `cd <repo>/infra/prod && docker compose up -d api`.
2. Remove the two plugin lines (`plugin ...` and `plugin_opt_config_file ...`) from the broker config, then:
   ```bash
   sudo systemctl restart mosquitto
   systemctl status mosquitto --no-pager
   ```
3. Re-run step 10, checks a, b and c.

Leave `<dynsec-file>` in place; do not delete it. Re-adding the two lines later brings the automatic accounts back. While the plugin is off, devices that only have an automatic account cannot connect: create file-based accounts for them (step 5) if they must keep working. If the config itself is broken, restore the backup from step 13.1 as in step 3.

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
- [ ] Only if automatic device accounts are wanted: Dynamic Security plugin tested on a copy, `password_file`/`acl_file` kept, Humidifier re-verified, admin used only over TLS or a private listener, test device added and deleted, `<dynsec-file>` included in the backups (step 13). Otherwise `MQTT_PROVISIONING=manual` stays set
- [ ] Owner reviewed this runbook and the result
