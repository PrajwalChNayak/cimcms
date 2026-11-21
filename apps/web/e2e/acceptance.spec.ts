import { expect, test } from "@playwright/test";
import { controlUrl, login, openControl } from "./support/app";
import { E2E } from "./support/env";
import { led } from "./support/led-sim";

// FRS section 16 acceptance (plan section 11). Serial: one simulator, one scratch database.
test.describe.configure({ mode: "serial" });

const ONLINE = "Online";

test.beforeAll(async () => {
  await led.start();
});
test.afterAll(async () => {
  await led.stop();
});

test("1 login: wrong password is refused, valid login reaches the dashboard and survives a hard reload", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E.users.admin.email);
  await page.locator("#password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "admin");
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/devices");
  await expect(page.getByTestId("device-card-LED-01")).toBeVisible();
});

test("2 LED-01 is online and shows the SIMULATION badge", async ({ page }) => {
  await login(page, "admin");
  await openControl(page);
  await expect(page.getByTestId("liveness-badge")).toHaveText(ONLINE);
  await expect(page.getByText("SIMULATION", { exact: true })).toBeVisible();
  await expect(page.getByTestId("simulation-banner")).toContainText("SIMULATION MODE");
});

test("3 all 16 relays are shown with Logical: labels (never lamp wording)", async ({ page }) => {
  await login(page, "admin");
  await openControl(page);
  for (let n = 1; n <= 16; n++) {
    await expect(page.getByTestId(`relay-state-${n}`)).toHaveText(/^Logical: (ON|OFF)$/);
  }
  await expect(page.getByTestId("relay-grid")).toHaveCount(1);
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).not.toContain("lamp on");
  expect(text).not.toContain("light is on");
});

test("4+5+7 relay 2 ON: Pending, state only changes on the device report, then Done, without reload", async ({ page }) => {
  await login(page, "admin");
  await openControl(page);
  await expect(page.getByTestId("relay-state-2")).toHaveText("Logical: OFF");
  await page.evaluate(() => {
    (window as unknown as { __e2eMarker: number }).__e2eMarker = 42;
  });

  await page.getByRole("button", { name: "Set relay 2 ON" }).click();
  await expect(page.getByTestId("relay-pending-2")).toContainText("Pending — waiting for device…");
  // plan section 8 rule 3: no optimistic update
  await expect(page.getByTestId("relay-state-2")).toHaveText("Logical: OFF");

  await expect(page.getByTestId("relay-state-2")).toHaveText("Logical: ON");
  await expect(page.getByTestId("relay-result-2")).toContainText("Done");
  await expect(page.getByTestId("relay-pending-2")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __e2eMarker?: number }).__e2eMarker)).toBe(42);
  expect(led.sim?.state.relays[1]).toBe(true);
});

test("8 All OFF asks for confirmation; Cancel sends nothing; confirm turns every relay OFF", async ({ page }) => {
  await login(page, "admin");
  await openControl(page);
  await expect(page.getByTestId("relay-state-2")).toHaveText("Logical: ON");

  await page.getByRole("button", { name: "All OFF" }).click();
  const title = "Turn ALL 16 relays OFF on LED-01?";
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByTestId("bulk-pending")).toHaveCount(0);
  await expect(page.getByTestId("relay-state-2")).toHaveText("Logical: ON");

  await page.getByRole("button", { name: "All OFF" }).click();
  await page.getByRole("button", { name: "Turn all OFF" }).click();
  await expect(page.getByTestId("bulk-pending")).toContainText("Pending — waiting for device…");
  for (let n = 1; n <= 16; n++) {
    await expect(page.getByTestId(`relay-state-${n}`)).toHaveText("Logical: OFF");
  }
  await expect(page.getByTestId("bulk-control-bar").getByTestId("command-status-pill")).toHaveText("Done");
});

test("9a simulator stopped: Offline text and disabled controls; recovers when it returns", async ({ page }) => {
  await login(page, "admin");
  await openControl(page);
  await expect(page.getByTestId("liveness-badge")).toHaveText(ONLINE);

  await led.stop();
  await expect(page.getByTestId("liveness-badge")).toHaveText("Offline");
  await expect(page.getByTestId("block-reason")).toHaveText("Device offline — commands disabled");
  await expect(page.getByRole("button", { name: "Set relay 1 ON" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "All OFF" })).toBeDisabled();

  await led.start();
  await expect(page.getByTestId("liveness-badge")).toHaveText(ONLINE);
  await expect(page.getByRole("button", { name: "Set relay 1 ON" })).toBeEnabled();
});

test("9b device that ignores commands: Pending, then No reply from device (about 20 s)", async ({ page }) => {
  test.setTimeout(90_000);
  await led.start({ ignoreCommands: true });
  await login(page, "admin");
  await openControl(page);
  await expect(page.getByTestId("liveness-badge")).toHaveText(ONLINE);

  await page.getByRole("button", { name: "Set relay 3 ON" }).click();
  await expect(page.getByTestId("relay-pending-3")).toBeVisible();
  // TTL 15 s + grace 5 s + sweeper interval (API has no env override for the TTL, D-10)
  await expect(page.getByTestId("relay-result-3")).toContainText("No reply from device", { timeout: 40_000 });
  await expect(page.getByTestId("relay-state-3")).toHaveText("Logical: OFF");
  await led.start();
});

test("10 viewer sees relay states but no controls", async ({ page }) => {
  await login(page, "viewer");
  await openControl(page);
  await expect(page.getByTestId("relay-state-1")).toHaveText(/^Logical: /);
  await expect(page.getByRole("button", { name: /Set relay \d+ (ON|OFF)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "All ON" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "All OFF" })).toHaveCount(0);
  await expect(page.getByTestId("bulk-control-bar")).toHaveCount(0);
});

test("technician can switch single relays but has no All ON/OFF", async ({ page }) => {
  await login(page, "tech");
  await openControl(page);
  await expect(page.getByRole("button", { name: "Set relay 4 ON" })).toBeEnabled();
  await expect(page.getByTestId("bulk-control-bar")).toHaveCount(0);
});

test("command history shows user, relay, requested state, result and time", async ({ page }) => {
  await login(page, "admin");
  await page.goto(`/devices/${E2E.deviceId}/commands`);
  const rows = page.getByRole("row");
  const relay2 = rows.filter({ hasText: "SET_RELAY" }).filter({ hasText: "Done" }).first();
  await expect(relay2).toBeVisible();
  await expect(relay2).toContainText(E2E.users.admin.email);
  await expect(relay2).toContainText(/ON/);
  await expect(relay2).toContainText(/\d{1,2}:\d{2}/);
  const noReply = rows.filter({ hasText: "No reply from device" }).first();
  await expect(noReply).toBeVisible();
  await expect(noReply).toContainText(E2E.users.admin.email);
  await expect(rows.filter({ hasText: "SET_ALL_RELAYS" }).first()).toContainText("Done");
  await expect(page.getByRole("columnheader", { name: "Requested state" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "User" })).toBeVisible();
});

test("secrets: page source, responses and websocket frames never carry the MQTT credentials", async ({ page }) => {
  const secrets = [E2E.mqtt.backendPassword, E2E.mqtt.ledPassword].filter((s) => s.length >= 8);
  expect(secrets.length).toBeGreaterThan(0);
  const credUrl = /mqtts?:\/\/[^\s"'/@]*:[^\s"'/@]*@/i;
  const texts: string[] = [];
  const bodyPromises: Promise<void>[] = [];

  page.on("response", (res) => {
    const type = res.headers()["content-type"] ?? "";
    if (!/json|text|javascript|html|xml/.test(type)) return;
    bodyPromises.push(
      res.text().then((t) => void texts.push(`${res.url()}\n${t}\n${JSON.stringify(res.headers())}`)).catch(() => undefined),
    );
  });
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => void texts.push(String(f.payload)));
    ws.on("framesent", (f) => void texts.push(String(f.payload)));
  });

  await login(page, "admin");
  for (const url of ["/dashboard", "/devices", controlUrl, `/devices/${E2E.deviceId}/commands`, `/devices/${E2E.deviceId}/events`, "/audit"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  }
  texts.push(await page.content());
  await Promise.all(bodyPromises);
  expect(texts.length).toBeGreaterThan(10);

  for (const t of texts) {
    for (const s of secrets) expect(t.includes(s)).toBe(false);
    expect(credUrl.test(t)).toBe(false);
  }
  // also not in browser storage or cookies
  const storage = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  const cookies = JSON.stringify(await page.context().cookies());
  for (const s of secrets) {
    expect(storage.includes(s)).toBe(false);
    expect(cookies.includes(s)).toBe(false);
  }
});
