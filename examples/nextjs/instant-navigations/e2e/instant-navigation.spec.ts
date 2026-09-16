import { expect, test } from '@playwright/test';
import { instant } from '@next/playwright';

// With Cache Components, the previous route stays in the DOM (hidden by
// <Activity>) after a client navigation. getByRole ignores hidden elements, so
// the assertions below cannot match the store listing by accident.

test.describe('Product page (/store/[slug])', () => {
  test('client navigation shows the cached product before inventory arrives', async ({ page }) => {
    await page.goto('/store');
    await expect(page.getByRole('heading', { level: 1, name: 'Store' })).toBeVisible();
    // Let the viewport prefetches finish, so the test checks the route's
    // structure rather than network timing.
    await page.waitForLoadState('networkidle');

    await instant(page, async () => {
      await page.getByRole('link', { name: 'Trail Runner' }).click();
      await page.waitForURL((url) => url.pathname === '/store/trail-runner');

      // Instantly visible: cached content resolved by the per-link prefetch,
      // plus the fallback for the dynamic inventory.
      await expect(page.getByRole('heading', { level: 1, name: 'Trail Runner' })).toBeVisible();
      await expect(page.getByRole('article').getByText('$129')).toBeVisible();
      await expect(page.getByText('Checking inventory…')).toBeVisible();

      // Held back until the instant() scope ends.
      await expect(page.getByText('in stock')).toHaveCount(0);
    });

    // Arrives later, streamed from the server.
    await expect(page.getByText('12 in stock')).toBeVisible();
    await expect(page.getByText('Checking inventory…')).toHaveCount(0);
  });

  test('initial page load serves the static shell first', async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto('/store/rain-shell');

        // The slug is listed in generateStaticParams and the lookup is cached,
        // so the product is part of the prerendered static shell.
        await expect(page.getByRole('heading', { level: 1, name: 'Rain Shell' })).toBeVisible();
        await expect(page.getByText('Checking inventory…')).toBeVisible();
        await expect(page.getByText('in stock')).toHaveCount(0);
      },
      { baseURL },
    );

    await expect(page.getByText('4 in stock')).toBeVisible();
  });
});
