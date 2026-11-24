import { expect, test } from '@playwright/test';
import { ADMIN, login } from './helpers';

/** On a phone-sized screen no page may scroll sideways (tables scroll inside their panel). */
test.use({ viewport: { width: 390, height: 844 } });

for (const path of [
  '/',
  '/citizens',
  '/complaints',
  '/studio',
  '/sessions',
  '/campaigns',
  '/reports',
])
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
  });

test('navigation opens from the menu button on a phone', async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
});
