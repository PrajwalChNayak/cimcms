import { expect, type Page } from "@playwright/test";
import { E2E, type E2eRole } from "./env";

export async function login(page: Page, role: E2eRole): Promise<void> {
  const u = E2E.users[role];
  await page.goto("/login");
  await page.getByLabel("Email address").fill(u.email);
  await page.locator("#password").fill(u.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export const controlUrl = `/devices/${E2E.deviceId}/control`;

export async function openControl(page: Page): Promise<void> {
  await page.goto(controlUrl);
  await expect(page.getByTestId("relay-grid")).toBeVisible();
}
