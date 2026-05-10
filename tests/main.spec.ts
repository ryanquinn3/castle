import { test, expect } from '@playwright/test';

test('main page looks correct', async ({ page }) => {
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1500); // wait for title scene fade-in
  await page.click('canvas');       // click through title screen to start game
  await page.waitForTimeout(1500); // wait for fade to planning phase
  await expect(page).toHaveScreenshot();
});
