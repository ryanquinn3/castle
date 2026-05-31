import { chromium } from 'playwright';

type Mode = 'title' | 'classic' | 'tide';

const args = process.argv.slice(2);
const flags: Record<string, string> = {};
const positional: string[] = [];

for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value] = arg.split('=');
    flags[key] = value ?? 'true';
  } else {
    positional.push(arg);
  }
}

const mode = (flags['--mode'] ?? 'classic') as Mode;
const output = flags['--output'] ?? '/tmp/castle-screenshot.png';
const url = positional[0] ?? 'http://localhost:5173';
const width = Number(flags['--width'] ?? 1280);
const height = Number(flags['--height'] ?? 720);

const modeButtons: Record<Exclude<Mode, 'title'>, string> = {
  classic: 'Classic Mode',
  tide: 'Tide Mode',
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: 'networkidle' });

  if (mode === 'title') {
    await page.getByRole('button', { name: 'Tide Mode' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
  } else {
    const btn = page.getByRole('button', { name: modeButtons[mode] });
    await btn.waitFor({ state: 'visible', timeout: 60000 });
    await btn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: output });
  await browser.close();
  console.log(`Screenshot saved to ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
