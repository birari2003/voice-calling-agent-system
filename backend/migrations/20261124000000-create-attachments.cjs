'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DATE, ENUM, CHAR } = Sequelize;
    const fk = (model, onDelete = 'RESTRICT') => ({
      type: INTEGER.UNSIGNED,
      references: { model, key: 'id' },
      onDelete,
      onUpdate: 'CASCADE',
    });

    await queryInterface.createTable('upload_tokens', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: { allowNull: false, ...fk('organizations') },
      complaint_id: { allowNull: false, ...fk('complaints') },
      // SHA-256 of the token; the token itself is shown once and never stored.
      token_hash: { allowNull: false, unique: true, type: CHAR(64) },
      expires_at: { allowNull: false, type: DATE },
      max_uploads: { allowNull: false, type: INTEGER.UNSIGNED },
      upload_count: { allowNull: false, defaultValue: 0, type: INTEGER.UNSIGNED },
      revoked_at: { allowNull: true, type: DATE },
      revoked_by: { allowNull: true, ...fk('users', 'SET NULL') },
      created_by: { allowNull: false, ...fk('users') },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('upload_tokens', ['complaint_id', 'created_at'], {
      name: 'upload_tokens_complaint_index',
    });

    await queryInterface.createTable('complaint_attachments', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: { allowNull: false, ...fk('organizations') },
      complaint_id: { allowNull: false, ...fk('complaints') },
      uploaded_by_user_id: { allowNull: true, ...fk('users', 'SET NULL') },
      upload_token_id: { allowNull: true, ...fk('upload_tokens', 'SET NULL') },
      source: { allowNull: false, type: ENUM('dashboard', 'upload_link', 'whatsapp') },
      // Display only; never used to build a storage path.
      original_filename: { allowNull: false, type: STRING(255) },
      storage_key: { allowNull: false, unique: true, type: STRING(80) },
      mime_type: { allowNull: false, type: STRING(60) },
      file_size: { allowNull: false, type: INTEGER.UNSIGNED },
      checksum: { allowNull: false, type: CHAR(64) },
      created_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('complaint_attachments', ['complaint_id', 'created_at'], {
      name: 'complaint_attachments_complaint_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('complaint_attachments');
    await queryInterface.dropTable('upload_tokens');
  },
};
