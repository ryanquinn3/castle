import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const output = process.argv[3] ?? '/tmp/castle-screenshot.png';
const width = Number(process.argv[4] ?? 1280);
const height = Number(process.argv[5] ?? 720);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url);
  await page.waitForTimeout(2000);

  // Click to dismiss title screen
  await page.mouse.click(width / 2, height / 2);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: output });
  await browser.close();
  console.log(`Screenshot saved to ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
