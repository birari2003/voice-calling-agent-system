'use strict';

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM organizations WHERE code = :code LIMIT 1',
      { replacements: { code: 'DEMO-MUNICIPAL' } },
    );
    if (existing.length > 0) return;
    const now = new Date();
    await queryInterface.bulkInsert('organizations', [
      {
        name: 'NagarSeva Demo Municipal Corporation',
        code: 'DEMO-MUNICIPAL',
        address: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('organizations', { code: 'DEMO-MUNICIPAL' });
  },
};
