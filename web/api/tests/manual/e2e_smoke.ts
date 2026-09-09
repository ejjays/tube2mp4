import puppeteer from 'puppeteer-core';

async function runSmokeTest() {
  console.log('[e2e] starting chromium...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      // termux chromium path
      executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    console.log('[e2e] navigating...');

    await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });

    const title = await page.title();
    console.log('[e2e] title:', title);

    if (title.includes('Google')) {
      console.log('[e2e] navigation ok');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[e2e] failed:', message);
  } finally {
    if (browser) await browser.close();
  }
}

runSmokeTest();
