'use strict';

const organizations = [{ code: 'DEMO-MUNICIPAL', name: 'NagarSeva Demo Municipal Corporation' }];
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
    'reports:read',
  ],
  Operator: ['dashboard:read', 'complaints:read', 'complaints:update'],
  Auditor: ['dashboard:read', 'citizens:read', 'complaints:read', 'reports:read', 'audit:read'],
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [organizationRows] = await queryInterface.sequelize.query(
      'SELECT id, code FROM organizations',
    );
    const existingOrganizationCodes = new Set(organizationRows.map(({ code }) => code));
    const missingOrganizations = organizations.filter(
      ({ code }) => !existingOrganizationCodes.has(code),
    );
    if (missingOrganizations.length) {
      await queryInterface.bulkInsert(
        'organizations',
        missingOrganizations.map(({ code, name }) => ({
          code,
          name,
          address: null,
          is_active: true,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    const [roleRowsBefore] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const existingRoleNames = new Set(roleRowsBefore.map(({ name }) => name));
    const missingRoleNames = Object.keys(rolePermissions).filter(
      (name) => !existingRoleNames.has(name),
    );
    if (missingRoleNames.length) {
      await queryInterface.bulkInsert(
        'roles',
        missingRoleNames.map((name) => ({
          name,
          description: `${name} access role`,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    const [permissionRowsBefore] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const existingPermissionNames = new Set(permissionRowsBefore.map(({ name }) => name));
    const missingPermissions = permissions.filter(([name]) => !existingPermissionNames.has(name));
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

    const [allRoles] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const [allPermissions] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions',
    );
    const roleIds = new Map(allRoles.map(({ id, name }) => [name, id]));
    const permissionIds = new Map(allPermissions.map(({ id, name }) => [name, id]));
    const [mappingRows] = await queryInterface.sequelize.query(
      'SELECT role_id, permission_id FROM role_permissions',
    );
    const existingMappings = new Set(
      mappingRows.map(({ role_id, permission_id }) => `${role_id}:${permission_id}`),
    );
    const mappings = Object.entries(rolePermissions).flatMap(([roleName, permissionNames]) =>
      permissionNames
        .filter(
          (permissionName) =>
            !existingMappings.has(`${roleIds.get(roleName)}:${permissionIds.get(permissionName)}`),
        )
        .map((permissionName) => ({
          role_id: roleIds.get(roleName),
          permission_id: permissionIds.get(permissionName),
          created_at: now,
          updated_at: now,
        })),
    );
    if (mappings.length) await queryInterface.bulkInsert('role_permissions', mappings);
  },
  async down() {
    throw new Error(
      'Reference role and organization data is shared foundation data and must not be rolled back automatically.',
    );
  },
};
