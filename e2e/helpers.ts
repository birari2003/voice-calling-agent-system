import { expect, type Page } from '@playwright/test';

export const ADMIN = { email: 'admin@nagar-seva.local', password: 'Pass@1234' };
export const OPERATOR = { email: 'operator@test.local', password: 'Integration-Test-Pass-1' };
export const AUDITOR = { email: 'auditor@test.local', password: 'Integration-Test-Pass-1' };
export const API = 'http://localhost:5056/api/v1';

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type=email]', user.email);
  await page.fill('input[type=password]', user.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
}

/** Creates a citizen through the API with the page's logged-in session (fast test setup). */
export async function createCitizen(page: Page, body: Record<string, unknown>): Promise<number> {
  return page.evaluate(
    async ({ api, body }) => {
      const csrf = await fetch(`${api}/auth/csrf`, { credentials: 'include' }).then((r) =>
        r.json(),
      );
      const response = await fetch(`${api}/citizens`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(json));
      return json.data.id as number;
    },
    { api: API, body },
  );
}
