'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, BOOLEAN, DATE, JSON } = Sequelize;
    await queryInterface.createTable('roles', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      name: { allowNull: false, unique: true, type: STRING(40) },
      description: { allowNull: false, type: STRING(200) },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.createTable('permissions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      name: { allowNull: false, unique: true, type: STRING(80) },
      description: { allowNull: false, type: STRING(200) },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.createTable('role_permissions', {
      role_id: {
        allowNull: false,
        primaryKey: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      permission_id: {
        allowNull: false,
        primaryKey: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'permissions', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.createTable('users', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      role_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'roles', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      name: { allowNull: false, type: STRING(160) },
      email: { allowNull: false, unique: true, type: STRING(254) },
      phone: { allowNull: true, type: STRING(20) },
      password_hash: { allowNull: false, type: STRING(255) },
      is_active: { allowNull: false, defaultValue: true, type: BOOLEAN },
      last_login_at: { allowNull: true, type: DATE },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.createTable('auth_sessions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      user_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      token_hash: { allowNull: false, unique: true, type: STRING(64) },
      expires_at: { allowNull: false, type: DATE },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('auth_sessions', ['user_id']);
    await queryInterface.addIndex('auth_sessions', ['expires_at']);
    await queryInterface.createTable('audit_logs', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      user_id: {
        allowNull: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      action: { allowNull: false, type: STRING(80) },
      metadata: { allowNull: true, type: JSON },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('audit_logs', ['user_id', 'created_at']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('auth_sessions');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('role_permissions');
    await queryInterface.dropTable('permissions');
    await queryInterface.dropTable('roles');
  },
};
