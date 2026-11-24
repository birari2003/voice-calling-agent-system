import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, login } from './helpers';

/** WCAG 2.1 A/AA automated checks on every screen. Serious and critical issues fail the test. */
async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = blocking.map(
    (v) =>
      `${name}: [${v.impact}] ${v.id} - ${v.help} (${v.nodes.length}x: ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join(', ')})`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

test('login page', async ({ page }) => {
  await page.goto('/login');
  await audit(page, 'login');
});

test('public upload page (invalid link state)', async ({ page }) => {
  await page.goto('/upload/not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page.getByRole('heading', { name: 'Link not available' })).toBeVisible();
  await audit(page, 'public upload');
});

const screens: Array<[string, string, string | RegExp]> = [
  ['dashboard', '/', 'Overview'],
  ['citizens', '/citizens', 'Citizens'],
  ['complaints', '/complaints', 'Complaints'],
  ['call studio', '/studio', 'AI call studio'],
  ['sessions', '/sessions', 'Sessions'],
  ['campaigns', '/campaigns', 'Campaigns'],
  ['reports', '/reports', 'Reports'],
];

for (const [name, path, heading] of screens)
  test(`${name} page`, async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await audit(page, name);
  });
