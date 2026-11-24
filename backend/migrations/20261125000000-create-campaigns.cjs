'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, DATE, ENUM, JSON, CHAR, TINYINT } = Sequelize;
    const fk = (model, onDelete = 'RESTRICT') => ({
      type: INTEGER.UNSIGNED,
      references: { model, key: 'id' },
      onDelete,
      onUpdate: 'CASCADE',
    });

    await queryInterface.createTable('campaigns', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: { allowNull: false, ...fk('organizations') },
      name: { allowNull: false, type: STRING(160) },
      description: { allowNull: true, type: TEXT },
      status: {
        allowNull: false,
        defaultValue: 'draft',
        type: ENUM('draft', 'ready', 'running', 'paused', 'completed', 'cancelled', 'failed'),
      },
      questionnaire_version_id: { allowNull: true, ...fk('questionnaire_versions', 'SET NULL') },
      default_language: { allowNull: true, type: ENUM('as', 'hi', 'en') },
      channel: { allowNull: false, defaultValue: 'text', type: ENUM('text', 'voice') },
      // { wards?: string[], locality?: string, language?: 'as'|'hi'|'en' }
      target_filter: { allowNull: false, type: JSON },
      max_attempts: { allowNull: false, defaultValue: 1, type: TINYINT.UNSIGNED },
      created_by: { allowNull: false, ...fk('users') },
      scheduled_at: { allowNull: true, type: DATE },
      started_at: { allowNull: true, type: DATE },
      completed_at: { allowNull: true, type: DATE },
      cancelled_at: { allowNull: true, type: DATE },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('campaigns', ['organization_id', 'status', 'created_at'], {
      name: 'campaigns_org_status_index',
    });

    await queryInterface.createTable('campaign_recipients', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      campaign_id: { allowNull: false, ...fk('campaigns', 'CASCADE') },
      citizen_id: { allowNull: false, ...fk('citizens') },
      status: {
        allowNull: false,
        defaultValue: 'pending',
        type: ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped', 'opted_out'),
      },
      exclusion_reason: {
        allowNull: true,
        type: ENUM('opted_out', 'inactive', 'missing_authorization', 'invalid_number', 'duplicate'),
      },
      attempt_count: { allowNull: false, defaultValue: 0, type: TINYINT.UNSIGNED },
      last_attempt_at: { allowNull: true, type: DATE },
      last_session_id: { allowNull: true, type: CHAR(36) },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('campaign_recipients', ['campaign_id', 'citizen_id'], {
      unique: true,
      name: 'campaign_recipients_unique',
    });
    await queryInterface.addIndex('campaign_recipients', ['campaign_id', 'status'], {
      name: 'campaign_recipients_status_index',
    });
    await queryInterface.addIndex('campaign_recipients', ['citizen_id', 'status'], {
      name: 'campaign_recipients_citizen_index',
    });

    // Link sessions to the campaign and the exact recipient they were run for.
    await queryInterface.addColumn('call_sessions', 'campaign_recipient_id', {
      allowNull: true,
      ...fk('campaign_recipients', 'SET NULL'),
    });
    await queryInterface.addConstraint('call_sessions', {
      fields: ['campaign_id'],
      type: 'foreign key',
      name: 'call_sessions_campaign_fk',
      references: { table: 'campaigns', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('call_sessions', 'call_sessions_campaign_fk');
    await queryInterface.removeColumn('call_sessions', 'campaign_recipient_id');
    await queryInterface.dropTable('campaign_recipients');
    await queryInterface.dropTable('campaigns');
  },
};
