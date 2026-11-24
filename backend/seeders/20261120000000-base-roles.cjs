'use strict';

const permissions = [
  ['dashboard:read', 'View dashboard and organization overview'],
  ['users:manage', 'Manage organization users and access'],
  ['citizens:manage', 'Manage citizen records'],
  ['citizens:read', 'View citizen records'],
  ['citizens:import', 'Import citizen records'],
  ['citizens:export', 'Export citizen records'],
  ['campaigns:manage', 'Manage campaigns'],
  ['complaints:read', 'View permitted complaints'],
  ['complaints:update', 'Update assigned complaint records'],
  ['complaints:create', 'Create confirmed complaints'],
  ['complaints:assign', 'Assign complaints to staff and departments'],
  ['complaints:notes', 'Add internal complaint notes'],
  ['complaints:read_all', 'Read all organization complaints'],
  ['complaints:update_all', 'Update all organization complaints'],
  ['complaints:archive', 'Archive complaints'],
  ['reports:read', 'View permitted reports'],
  ['settings:manage', 'Manage system and AI settings'],
  ['audit:read', 'View audit records'],
];

const rolePermissions = {
  'Super Admin': permissions.map(([name]) => name),
  'Municipal Admin': [
    'dashboard:read',
    'citizens:manage',
    'citizens:read',
    'citizens:import',
    'citizens:export',
    'campaigns:manage',
    'complaints:read',
    'complaints:update',
    'complaints:create',
    'complaints:assign',
    'complaints:notes',
    'complaints:read_all',
    'complaints:update_all',
    'complaints:archive',
    'reports:read',
  ],
  Operator: ['dashboard:read', 'complaints:read', 'complaints:update', 'complaints:notes'],
  Auditor: [
    'dashboard:read',
    'citizens:read',
    'complaints:read',
    'complaints:read_all',
    'reports:read',
    'audit:read',
  ],
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const roles = Object.keys(rolePermissions);
    const [existingRoleRows] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const existingRoleNames = new Set(existingRoleRows.map((row) => row.name));
    const missingRoles = roles.filter((name) => !existingRoleNames.has(name));
    if (missingRoles.length)
      await queryInterface.bulkInsert(
        'roles',
        missingRoles.map((name) => ({
          name,
          description: `${name} access role`,
          created_at: now,
          updated_at: now,
        })),
      );
    const [existingPermissionRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const existingPermissionNames = new Set(existingPermissionRows.map((row) => row.name));
    const missingPermissions = permissions.filter(([name]) => !existingPermissionNames.has(name));
    if (missingPermissions.length)
      await queryInterface.bulkInsert(
        'permissions',
        missingPermissions.map(([name, description]) => ({
          name,
          description,
          created_at: now,
          updated_at: now,
        })),
      );
    const [roleRows] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const [permissionRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const roleIds = new Map(roleRows.map((row) => [row.name, row.id]));
    const permissionIds = new Map(permissionRows.map((row) => [row.name, row.id]));
    const [existingMappingRows] = await queryInterface.sequelize.query(
      'SELECT role_id, permission_id FROM role_permissions',
    );
    const existingMappings = new Set(
      existingMappingRows.map((row) => `${row.role_id}:${row.permission_id}`),
    );
    const missingMappings = Object.entries(rolePermissions).flatMap(([role, names]) =>
      names
        .map((permission) => ({ role, permission }))
        .filter(
          ({ role, permission }) =>
            !existingMappings.has(`${roleIds.get(role)}:${permissionIds.get(permission)}`),
        )
        .map(({ role, permission }) => ({
          role_id: roleIds.get(role),
          permission_id: permissionIds.get(permission),
          created_at: now,
          updated_at: now,
        })),
    );
    if (missingMappings.length)
      await queryInterface.bulkInsert('role_permissions', missingMappings);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  },
};
