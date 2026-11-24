'use strict';

const permissions = [
  ['attachments:upload', 'Upload complaint photos and create citizen upload links'],
  ['attachments:read', 'View complaint photos'],
];
const grants = {
  'Super Admin': ['attachments:upload', 'attachments:read'],
  'Municipal Admin': ['attachments:upload', 'attachments:read'],
  Operator: ['attachments:upload', 'attachments:read'],
  Auditor: ['attachments:read'],
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [existingPermissions] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const existingNames = new Set(existingPermissions.map(({ name }) => name));
    const missing = permissions.filter(([name]) => !existingNames.has(name));
    if (missing.length) {
      await queryInterface.bulkInsert(
        'permissions',
        missing.map(([name, description]) => ({
          name,
          description,
          created_at: now,
          updated_at: now,
        })),
      );
    }
    const [roles] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const [allPermissions] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const roleIds = new Map(roles.map(({ id, name }) => [name, id]));
    const permissionIds = new Map(allPermissions.map(({ id, name }) => [name, id]));
    const [rows] = await queryInterface.sequelize.query(
      'SELECT role_id, permission_id FROM role_permissions',
    );
    const existing = new Set(
      rows.map(({ role_id, permission_id }) => `${role_id}:${permission_id}`),
    );
    const additions = Object.entries(grants).flatMap(([role, names]) =>
      roleIds.has(role)
        ? names
            .filter((name) => !existing.has(`${roleIds.get(role)}:${permissionIds.get(name)}`))
            .map((name) => ({
              role_id: roleIds.get(role),
              permission_id: permissionIds.get(name),
              created_at: now,
              updated_at: now,
            }))
        : [],
    );
    if (additions.length) await queryInterface.bulkInsert('role_permissions', additions);
  },
  async down(queryInterface) {
    const names = permissions.map(([name]) => name);
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE name IN (:names)',
      { replacements: { names } },
    );
    const ids = rows.map(({ id }) => id);
    if (ids.length) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: ids }, {});
      await queryInterface.bulkDelete('permissions', { id: ids }, {});
    }
  },
};
