'use strict';

/**
 * Creates the first Super Admin for staging/production from environment variables:
 *   ADMIN_EMAIL, ADMIN_NAME (optional), ADMIN_PASSWORD (min 14 characters).
 * Idempotent: does nothing if the account already exists. Never prints the password.
 */
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    const name = (process.env.ADMIN_NAME || 'NagarSeva Administrator').trim();
    const organizationCode = process.env.ADMIN_ORGANIZATION_CODE || 'DEMO-MUNICIPAL';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new Error('Set ADMIN_EMAIL to a valid email address.');
    if (password.length < 14 || password === 'Pass@1234')
      throw new Error('Set ADMIN_PASSWORD to a strong password of at least 14 characters.');

    const [[existing]] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email } },
    );
    if (existing) {
      console.log(`Admin ${email} already exists; nothing to do.`);
      return;
    }
    const [[organization]] = await queryInterface.sequelize.query(
      'SELECT id FROM organizations WHERE code = :code LIMIT 1',
      { replacements: { code: organizationCode } },
    );
    if (!organization)
      throw new Error(`Organization ${organizationCode} was not found. Run seeders first.`);
    const [[role]] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1",
    );
    if (!role) throw new Error('Super Admin role was not found. Run seeders first.');
    const now = new Date();
    await queryInterface.bulkInsert('users', [
      {
        organization_id: organization.id,
        role_id: role.id,
        name,
        email,
        password_hash: await bcrypt.hash(password, 12),
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    console.log(`Created Super Admin ${email}.`);
  },
  async down() {},
};
