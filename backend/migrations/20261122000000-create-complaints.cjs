'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, BOOLEAN, DATE, ENUM } = Sequelize;
    await queryInterface.createTable('complaints', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      ticket_id: { allowNull: false, unique: true, type: STRING(32) },
      organization_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      citizen_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'citizens', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      category: { allowNull: false, type: STRING(80) },
      description: { allowNull: false, type: TEXT },
      locality: { allowNull: false, type: STRING(160) },
      ward: { allowNull: true, type: STRING(40) },
      landmark: { allowNull: true, type: STRING(160) },
      location_verified: { allowNull: false, defaultValue: false, type: BOOLEAN },
      priority: {
        allowNull: false,
        defaultValue: 'normal',
        type: ENUM('low', 'normal', 'high', 'urgent'),
      },
      status: {
        allowNull: false,
        defaultValue: 'registered',
        type: ENUM(
          'registered',
          'acknowledged',
          'assigned',
          'in_progress',
          'resolved',
          'closed',
          'reopened',
        ),
      },
      assigned_to: {
        allowNull: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      assigned_department: { allowNull: true, type: STRING(120) },
      source: { allowNull: false, defaultValue: 'staff', type: ENUM('staff', 'simulated_ai') },
      source_session_id: { allowNull: true, type: STRING(36) },
      citizen_confirmed: { allowNull: false, defaultValue: false, type: BOOLEAN },
      citizen_confirmed_at: { allowNull: true, type: DATE },
      idempotency_key: { allowNull: true, type: STRING(100) },
      request_hash: { allowNull: true, type: STRING(64) },
      created_by: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      archived_at: { allowNull: true, type: DATE },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('complaints', ['organization_id', 'ticket_id'], {
      unique: true,
      name: 'complaints_org_ticket_unique',
    });
    await queryInterface.addIndex('complaints', ['organization_id', 'idempotency_key'], {
      unique: true,
      name: 'complaints_org_idempotency_unique',
    });
    await queryInterface.addIndex('complaints', ['organization_id', 'status', 'created_at'], {
      name: 'complaints_org_status_created_index',
    });
    await queryInterface.addIndex('complaints', ['organization_id', 'ward', 'priority'], {
      name: 'complaints_org_ward_priority_index',
    });
    await queryInterface.addIndex('complaints', ['assigned_to', 'status'], {
      name: 'complaints_assignee_status_index',
    });

    await queryInterface.createTable('complaint_status_history', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      complaint_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'complaints', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      from_status: { allowNull: true, type: STRING(30) },
      to_status: { allowNull: false, type: STRING(30) },
      changed_by: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      note: { allowNull: true, type: STRING(500) },
      changed_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('complaint_status_history', ['complaint_id', 'changed_at'], {
      name: 'complaint_history_timeline_index',
    });

    await queryInterface.createTable('complaint_notes', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      complaint_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'complaints', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      author_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      body: { allowNull: false, type: TEXT },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('complaint_notes', ['complaint_id', 'created_at'], {
      name: 'complaint_notes_timeline_index',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('complaint_notes');
    await queryInterface.dropTable('complaint_status_history');
    await queryInterface.dropTable('complaints');
  },
};
