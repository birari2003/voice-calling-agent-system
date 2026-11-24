'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, DATE, ENUM, JSON, CHAR, DECIMAL, BOOLEAN } = Sequelize;

    await queryInterface.createTable('questionnaire_versions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      version: { allowNull: false, type: INTEGER.UNSIGNED },
      language_content: { allowNull: false, type: JSON },
      is_active: { allowNull: false, defaultValue: false, type: BOOLEAN },
      created_by: {
        allowNull: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('questionnaire_versions', ['organization_id', 'version'], {
      unique: true,
      name: 'questionnaire_versions_org_version_unique',
    });

    await queryInterface.createTable('call_sessions', {
      // UUID so the id can be shared with the AI service and stored in complaints.source_session_id.
      id: { allowNull: false, primaryKey: true, type: CHAR(36) },
      organization_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      citizen_id: {
        allowNull: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'citizens', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      // Campaigns arrive in Phase 7; the column is reserved without a foreign key until then.
      campaign_id: { allowNull: true, type: INTEGER.UNSIGNED },
      questionnaire_version_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'questionnaire_versions', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      mode: { allowNull: false, defaultValue: 'simulation', type: ENUM('simulation', 'telephony') },
      channel: { allowNull: false, defaultValue: 'text', type: ENUM('text', 'voice') },
      provider: { allowNull: false, defaultValue: 'local', type: STRING(40) },
      provider_session_id: { allowNull: true, type: STRING(120) },
      dialogue_engine: { allowNull: false, type: STRING(60) },
      status: { allowNull: false, defaultValue: 'active', type: ENUM('active', 'ended') },
      conversation_state: { allowNull: false, type: STRING(40) },
      conversation_context: { allowNull: false, type: JSON },
      language: { allowNull: true, type: ENUM('as', 'hi', 'en') },
      outcome: {
        allowNull: true,
        type: ENUM(
          'complaint_created',
          'cancelled_by_citizen',
          'cancelled_by_staff',
          'handoff',
          'ended_without_complaint',
        ),
      },
      complaint_id: {
        allowNull: true,
        unique: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'complaints', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      confirmed_at: { allowNull: true, type: DATE },
      recording_storage_key: { allowNull: true, type: STRING(255) },
      error_code: { allowNull: true, type: STRING(60) },
      error_message: { allowNull: true, type: STRING(500) },
      started_by: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      started_at: { allowNull: false, type: DATE },
      ended_at: { allowNull: true, type: DATE },
      duration_seconds: { allowNull: true, type: INTEGER.UNSIGNED },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('call_sessions', ['organization_id', 'started_at'], {
      name: 'call_sessions_org_started_index',
    });
    await queryInterface.addIndex('call_sessions', ['organization_id', 'status', 'outcome'], {
      name: 'call_sessions_org_status_outcome_index',
    });
    await queryInterface.addIndex('call_sessions', ['citizen_id', 'started_at'], {
      name: 'call_sessions_citizen_index',
    });

    await queryInterface.createTable('session_messages', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      session_id: {
        allowNull: false,
        type: CHAR(36),
        references: { model: 'call_sessions', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      sequence_number: { allowNull: false, type: INTEGER.UNSIGNED },
      speaker: { allowNull: false, type: ENUM('citizen', 'assistant', 'system') },
      message_text: { allowNull: false, type: TEXT },
      language: { allowNull: true, type: ENUM('as', 'hi', 'en') },
      conversation_state: { allowNull: false, type: STRING(40) },
      confidence: { allowNull: true, type: DECIMAL(4, 3) },
      client_message_id: { allowNull: true, type: STRING(64) },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('session_messages', ['session_id', 'sequence_number'], {
      unique: true,
      name: 'session_messages_sequence_unique',
    });
    await queryInterface.addIndex('session_messages', ['session_id', 'client_message_id'], {
      unique: true,
      name: 'session_messages_client_id_unique',
    });

    // One complaint per session at the database level, in addition to the service guard.
    await queryInterface.addIndex('complaints', ['source_session_id'], {
      unique: true,
      name: 'complaints_source_session_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('complaints', 'complaints_source_session_unique');
    await queryInterface.dropTable('session_messages');
    await queryInterface.dropTable('call_sessions');
    await queryInterface.dropTable('questionnaire_versions');
  },
};
