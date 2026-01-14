import { expect, test } from "@playwright/test";

test("home page renders the studio shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Prompt optimization/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Generate/i }),
  ).toBeVisible();
});
