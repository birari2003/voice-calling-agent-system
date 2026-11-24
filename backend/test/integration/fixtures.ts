/** Accounts created only in the throwaway integration-test database. */
export const TEST_PASSWORD = 'Integration-Test-Pass-1';
export const ADMIN = { email: 'admin@nagar-seva.local', password: 'Pass@1234' };
export const TEST_USERS = [
  {
    email: 'operator@test.local',
    name: 'Test Operator',
    role: 'Operator',
    otherOrganization: false,
  },
  { email: 'auditor@test.local', name: 'Test Auditor', role: 'Auditor', otherOrganization: false },
  {
    email: 'admin@other.test',
    name: 'Other Org Admin',
    role: 'Super Admin',
    otherOrganization: true,
  },
] as const;

/** A tiny valid JPEG (8x8 grey), enough to pass signature validation. */
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);
