'use strict';

const bcrypt = require('bcryptjs');
const BOOTSTRAP_ADMIN = {
  email: 'admin@nagar-seva.local',
  name: 'NagarSeva Administrator',
  password: 'Pass@1234',
  organizationCode: 'DEMO-MUNICIPAL',
};

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('This local bootstrap account seeder cannot run in production.');
    }
    const { email, password, name, organizationCode } = BOOTSTRAP_ADMIN;
    const [[existingUser]] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email } },
    );
    if (existingUser)
      throw new Error(`An account already exists for ${email}; this seeder will not overwrite it.`);

    const [[organization]] = await queryInterface.sequelize.query(
      'SELECT id FROM organizations WHERE code = :code LIMIT 1',
      { replacements: { code: organizationCode } },
    );
    if (!organization)
      throw new Error(`Organization ${organizationCode} was not found. Run npm run db:seed first.`);
    const [[role]] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1",
    );
    if (!role) throw new Error('Super Admin role was not found. Run npm run db:seed first.');

    const now = new Date();
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert(
        'users',
        [
          {
            organization_id: organization.id,
            role_id: role.id,
            name,
            email,
            phone: null,
            password_hash: await bcrypt.hash(password, 12),
            is_active: true,
            last_login_at: null,
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction },
      );
      const [[createdUser]] = await queryInterface.sequelize.query(
        'SELECT id FROM users WHERE email = :email LIMIT 1',
        { replacements: { email }, transaction },
      );
      await queryInterface.bulkInsert(
        'audit_logs',
        [
          {
            user_id: createdUser.id,
            action: 'auth.admin_created',
            metadata: null,
            created_at: now,
          },
        ],
        { transaction },
      );
    });
    console.log(`Created local Super Admin account: ${email}.`);
  },

  async down(queryInterface) {
    const { email } = BOOTSTRAP_ADMIN;
    const [[user]] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email } },
    );
    if (!user) return;
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete(
        'audit_logs',
        { user_id: user.id, action: 'auth.admin_created' },
        { transaction },
      );
      await queryInterface.bulkDelete('auth_sessions', { user_id: user.id }, { transaction });
      await queryInterface.bulkDelete('users', { id: user.id }, { transaction });
    });
  },
};
