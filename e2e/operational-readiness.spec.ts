import { expect, test } from "@playwright/test";

test("fleet registry controls are interactive and accessible", async ({ page }) => {
  await page.goto("/vehicles");
  await expect(page).toHaveTitle(/Fleet/);
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toBeVisible();
  const firstVehicleCard = page.locator(".vehicle-card").first();
  await expect(firstVehicleCard.locator(".vehicle-card-assignment")).toBeVisible();
  await expect(firstVehicleCard.locator(".vehicle-card-assignment strong")).not.toBeEmpty();

  const search = page.getByRole("textbox", { name: "Search vehicles" });
  await search.fill("no-such-vehicle-e2e");
  await expect(page.getByRole("heading", { name: "No vehicles match these filters" })).toBeVisible();
  await search.fill("");

  await page.getByRole("link", { name: "Add vehicle" }).click();
  await expect(page).toHaveURL(/\/settings\/vehicles\?create=1$/);
  await expect(page.getByRole("dialog", { name: "Add vehicle" })).toBeVisible();
  await expect(page.getByLabel("Vehicle class *")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog", { name: "Add vehicle" })).toBeHidden();
});

test("dashboard action icons remain centered and form status is data driven", async ({ page }) => {
  await page.goto("/");
  const actionItems = page.locator(".action-item");
  await expect(actionItems).toHaveCount(3);
  await expect(actionItems.last()).toContainText(/published forms available|no published forms available/i);

  const icon = actionItems.first().locator(".action-icon");
  const svg = icon.locator("svg");
  const [iconBox, svgBox] = await Promise.all([icon.boundingBox(), svg.boundingBox()]);
  expect(iconBox).not.toBeNull();
  expect(svgBox).not.toBeNull();
  expect(Math.abs((iconBox!.x + iconBox!.width / 2) - (svgBox!.x + svgBox!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs((iconBox!.y + iconBox!.height / 2) - (svgBox!.y + svgBox!.height / 2))).toBeLessThanOrEqual(1);
});

test("QR batch contains one printable label per active QR", async ({ page }) => {
  await page.goto("/vehicles");
  await page.getByRole("link", { name: "Print QR batch" }).click();
  await expect(page).toHaveURL(/\/vehicles\/qr\/print$/);
  const labels = page.locator(".printable-qr-label");
  const empty = page.getByText("No active QR labels");
  await expect(labels.first().or(empty)).toBeVisible();
  if (await labels.count()) {
    await expect(labels.first().getByText("SCAN BEFORE OPERATING")).toBeVisible();
    await expect(labels.first().getByRole("img")).toHaveAttribute("alt", /QR label for/);
  }
});

test("form catalog exposes lifecycle and assignability", async ({ page }) => {
  await page.goto("/settings/forms");
  await expect(page.getByRole("heading", { name: "Form catalog", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Form lifecycle" })).toBeVisible();
  await expect(page.getByText("Published means ready to assign")).toBeVisible();
  await expect(page.getByRole("link", { name: /Dump Truck Pre-Trip Inspection/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Standard Truck Inspection/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /published ready to assign/i }).first()).toBeVisible();
});

test("application publishes install metadata without caching protected APIs", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).name).toBe("City of Harvey PW Fleet");

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain('url.pathname.startsWith("/api/")');
  const offline = await request.get("/offline.html");
  expect(offline.ok()).toBeTruthy();
  expect(await offline.text()).not.toMatch(/<(style|script)|\sonclick=/i);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
});

test("administration exposes readiness, audit, class, and import controls", async ({ page }) => {
  await page.goto("/settings/readiness");
  await expect(page.getByRole("heading", { name: "Pilot readiness", level: 1 })).toBeVisible();
  await expect(page.getByText(/of 9 ready/)).toBeVisible();

  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { name: "Audit trail", level: 1 })).toBeVisible();

  await page.goto("/settings/vehicles");
  await expect(page.getByRole("heading", { name: "Vehicle classes", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import CSV" })).toBeVisible();
  await expect(page.getByText("No published inspection forms")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign form" }).first()).toBeEnabled();
});
