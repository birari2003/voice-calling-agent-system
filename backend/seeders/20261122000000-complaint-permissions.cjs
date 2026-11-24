'use strict';

const permissions = [
  ['complaints:create', 'Create confirmed complaints'],
  ['complaints:assign', 'Assign complaints to staff and departments'],
  ['complaints:notes', 'Add internal complaint notes'],
  ['complaints:read_all', 'Read all organization complaints'],
  ['complaints:update_all', 'Update all organization complaints'],
  ['complaints:archive', 'Archive complaints'],
];
const grants = {
  'Super Admin': permissions.map(([name]) => name),
  'Municipal Admin': permissions.map(([name]) => name),
  Operator: ['complaints:notes'],
  Auditor: ['complaints:read_all'],
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [oldPermissions] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const existingNames = new Set(oldPermissions.map(({ name }) => name));
    const missingPermissions = permissions.filter(([name]) => !existingNames.has(name));
    if (missingPermissions.length) {
      await queryInterface.bulkInsert(
        'permissions',
        missingPermissions.map(([name, description]) => ({
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
      names
        .filter((name) => !existing.has(`${roleIds.get(role)}:${permissionIds.get(name)}`))
        .map((name) => ({
          role_id: roleIds.get(role),
          permission_id: permissionIds.get(name),
          created_at: now,
          updated_at: now,
        })),
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
