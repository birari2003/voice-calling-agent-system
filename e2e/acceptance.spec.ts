import { expect, test } from '@playwright/test';
import { ADMIN, OPERATOR, createCitizen, login } from './helpers';

/** Blueprint section 18, end-to-end acceptance scenario, through the real UI. */
test('acceptance: AI session -> one complaint -> operator transcript and photo -> reports', async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage();
  await login(adminPage, ADMIN);
  const citizenId = await createCitizen(adminPage, {
    fullName: 'Browser Acceptance Citizen',
    phone: '+919900000101',
    preferredLanguage: 'en',
    locality: 'Ulubari',
    contactAuthorized: true,
    consentSource: 'E2E test form',
  });

  // 3-8: studio conversation, read-back, confirmation, exactly one ticket
  await adminPage.goto('/studio');
  const setup = adminPage.locator('form.studio-setup select');
  await setup.nth(0).selectOption(String(citizenId));
  await setup.nth(1).selectOption('en');
  await adminPage.getByRole('button', { name: 'Start simulation' }).click();
  await expect(
    adminPage.getByText(/AI assistant that registers municipal complaints/),
  ).toBeVisible();
  const reply = async (text: string) => {
    const count = await adminPage.locator('.transcript-message:not(.pending)').count();
    await adminPage.getByLabel('Citizen reply').fill(text);
    await adminPage.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(() => adminPage.locator('.transcript-message:not(.pending)').count())
      .toBeGreaterThan(count + 1);
  };
  await reply('Garbage has not been collected for five days');
  await reply('Ulubari, ward 3, near the water tank');
  await expect(adminPage.getByText(/Let me read back the details/)).toBeVisible();
  await expect(adminPage.locator('.studio-step')).toHaveText('Waiting for confirmation');
  await reply('yes');
  await expect(adminPage.locator('.studio-step')).toHaveText('Completed');
  const ticket = adminPage.locator('.collected-field', { hasText: 'Ticket' }).getByRole('link');
  const ticketId = (await ticket.textContent())!.trim();
  expect(ticketId).toMatch(/^NS-\d{4}-/);

  // 9: dashboard and complaint list show it; assign to the operator
  await ticket.click();
  await expect(adminPage.getByRole('heading', { name: ticketId })).toBeVisible();
  const complaintUrl = adminPage.url();
  await adminPage
    .locator('label:has-text("Staff member") select')
    .selectOption({ label: 'Test Operator · Operator' });
  await adminPage.getByRole('button', { name: 'Save assignment' }).click();
  await expect(adminPage.getByText('Assignment saved.')).toBeVisible();

  // 10-12: operator opens the ticket, reads the transcript, uploads a photo
  const operatorPage = await (await browser.newContext()).newPage();
  await login(operatorPage, OPERATOR);
  await operatorPage.goto(complaintUrl);
  await operatorPage.getByText('Conversation transcript').click();
  await expect(
    operatorPage.locator('.complaint-transcript .transcript-message.citizen').first(),
  ).toBeVisible();
  await expect(operatorPage.getByText('No audio recording exists')).toBeVisible();
  const chooser = operatorPage.waitForEvent('filechooser');
  await operatorPage.getByRole('button', { name: 'Upload photos' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'garbage.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
      'base64',
    ),
  });
  await expect(operatorPage.locator('.photo-thumb')).toHaveCount(1);
  await expect(operatorPage.locator('.photo-source')).toHaveText('Staff upload');

  // 13: reports reflect the complaint and the session
  await adminPage.goto('/reports');
  const registered = adminPage.locator('.report-stat', { hasText: 'Complaints registered' });
  await expect(registered.locator('strong')).not.toHaveText('0');
  await expect(registered).toContainText('from AI sessions');
});

test('14: cancelling and answering "no" create no complaint', async ({ page }) => {
  await login(page, ADMIN);
  const citizenId = await createCitizen(page, {
    fullName: 'Browser Cancel Citizen',
    phone: '+919900000102',
    preferredLanguage: 'en',
  });
  await page.goto('/complaints');
  const totalBefore = await page.locator('.complaint-summary-strip strong').textContent();
  for (const answers of [
    ['Water pipe is leaking badly', 'stop'],
    ['Streetlight on our lane is broken', 'Paltan Bazar', 'skip', 'no'],
  ]) {
    await page.goto('/studio');
    const setup = page.locator('form.studio-setup select');
    await setup.nth(0).selectOption(String(citizenId));
    await setup.nth(1).selectOption('en');
    await page.getByRole('button', { name: 'Start simulation' }).click();
    for (const text of answers) {
      const count = await page.locator('.transcript-message:not(.pending)').count();
      await page.getByLabel('Citizen reply').fill(text);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect
        .poll(() => page.locator('.transcript-message:not(.pending)').count())
        .toBeGreaterThan(count + 1);
    }
  }
  await expect(page.locator('.studio-step')).toHaveText('Asking what to correct');
  await page.goto('/complaints');
  await expect(page.locator('.complaint-summary-strip strong')).toHaveText(totalBefore!);
});
