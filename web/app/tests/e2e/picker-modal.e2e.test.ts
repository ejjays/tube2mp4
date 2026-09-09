import { test, expect } from '@playwright/test';

const E2E_URLS = [
  {
    id: 'vimeo',
    url: 'https://vimeo.com/76979871',
    expectTitle: 'The New Vimeo Player',
  },
  {
    id: 'soundcloud',
    url: 'https://soundcloud.com/marshmellomusic/alone',
    expectTitle: 'Alone',
  },
  {
    id: 'threads',
    url: 'https://www.threads.com/@mrbeast/post/DOCp-qLiXVo',
    expectTitle: null,
  },
] as const;

for (const { id, url, expectTitle } of E2E_URLS) {
  test(`picker modal — ${id}`, async ({ page }) => {
    test.setTimeout(120_000);

    const infoRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/info?')) infoRequests.push(req.url());
    });

    const infoResponses: { url: number; body: string }[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('/info?')) {
        let body = '';
        try {
          body = (await res.text()).slice(0, 500);
        } catch { /* */ }
        infoResponses.push({ url: res.status(), body });
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const input = page.locator('#url-input');
    await expect(input).toBeVisible();

    const convertBtn = page.getByRole('button', { name: /Convert & Download|Processing/ });
    await expect(convertBtn).toBeVisible();

    await input.fill(url);
    await input.press('Enter');

    const dialog = page.getByRole('dialog');
    try {
      await expect(dialog).toBeVisible({ timeout: 80_000 });
    } catch {
      console.log(`[e2e] ${id} info requests: ${JSON.stringify(infoRequests)}`);
      console.log(`[e2e] ${id} info responses: ${JSON.stringify(infoResponses)}`);
      console.log(`[e2e] ${id} page title: ${await page.title()}`);
      console.log(`[e2e] ${id} url: ${page.url()}`);
      throw new Error(
        `[e2e] ${id} dialog did not appear. info requests: ${infoRequests.length}, ` +
        `responses: ${JSON.stringify(infoResponses.map((resp) => resp.url))}`
      );
    }

    const thumbnail = dialog.getByRole('img', { name: 'Thumbnail' });
    await expect(thumbnail).toBeVisible();
    const src = await thumbnail.getAttribute('src');
    expect(src, 'thumbnail has a real image URL').toBeTruthy();
    expect(src).not.toContain('logo.webp');

    const title = dialog.locator('h3');
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText, 'title is not empty').toBeTruthy();
    expect(titleText ? titleText.length : 0).toBeGreaterThan(2);
    if (expectTitle && titleText) {
      expect(titleText.toLowerCase()).toContain(expectTitle.toLowerCase());
    }

    const qualityTrigger = dialog.locator('[aria-haspopup="listbox"]');
    const hasQualityPicker = await qualityTrigger.isVisible({ timeout: 5_000 }).catch(() => false);

    let optionCount = 0;
    if (hasQualityPicker) {
      await qualityTrigger.click();
      const options = dialog.locator('[role="option"]');
      optionCount = await options.count();
      expect(optionCount, 'at least 1 quality option').toBeGreaterThanOrEqual(1);

      const selected = dialog.locator('[role="option"][aria-selected="true"]');
      await expect(selected).toBeVisible();
      await qualityTrigger.click();
    }

    const getFileBtn = dialog.getByRole('button', { name: 'Get File' });
    await expect(getFileBtn).toBeVisible();
    await expect(getFileBtn).toBeEnabled();

    console.log(
      `[e2e] ${id} PASS title="${titleText ? titleText.slice(0, 60) : '-'}" options=${optionCount}`
    );
  });
}

test('input + error handling', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const input = page.locator('#url-input');
  await expect(input).toBeVisible();
  await input.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

  await input.fill('not-a-url');
  await input.press('Enter');
  const error = page.locator('[role="alert"], .text-red, .text-red-400, .text-orange');
  await expect(error.first()).toBeVisible({ timeout: 15_000 });
});
