import { expect, test } from "@playwright/test";

test("optimization flow completes from UI", async ({ page }) => {
  test.setTimeout(360_000);

  await page.goto("/");

  await page.getByLabel("Iterations").fill("1");
  await page.getByLabel("Replicates").fill("1");
  await page.getByLabel("Patch candidates").fill("1");

  const startButton = page.getByRole("button", { name: /Start optimization/i });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.getByText(/Optimization running/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("System step")).toBeVisible();

  await expect(
    page.getByText("completed", { exact: true }).first(),
  ).toBeVisible({ timeout: 360_000 });
});
