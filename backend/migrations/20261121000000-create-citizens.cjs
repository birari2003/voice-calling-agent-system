'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, BOOLEAN, DATE, ENUM } = Sequelize;
    await queryInterface.createTable('citizens', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: INTEGER.UNSIGNED },
      organization_id: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      full_name: { allowNull: true, type: STRING(160) },
      phone: { allowNull: true, type: STRING(16) },
      whatsapp_number: { allowNull: true, type: STRING(16) },
      preferred_language: { allowNull: false, defaultValue: 'as', type: ENUM('as', 'hi', 'en') },
      locality: { allowNull: true, type: STRING(160) },
      ward: { allowNull: true, type: STRING(40) },
      contact_authorized: { allowNull: false, defaultValue: false, type: BOOLEAN },
      consent_source: { allowNull: true, type: STRING(120) },
      consent_recorded_at: { allowNull: true, type: DATE },
      opted_out: { allowNull: false, defaultValue: false, type: BOOLEAN },
      opted_out_at: { allowNull: true, type: DATE },
      is_active: { allowNull: false, defaultValue: true, type: BOOLEAN },
      notes: { allowNull: true, type: TEXT },
      created_by: {
        allowNull: false,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      updated_by: {
        allowNull: true,
        type: INTEGER.UNSIGNED,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      deactivated_at: { allowNull: true, type: DATE },
      created_at: { allowNull: false, type: DATE },
      updated_at: { allowNull: false, type: DATE },
    });
    await queryInterface.addIndex('citizens', ['organization_id', 'phone'], {
      unique: true,
      name: 'citizens_org_phone_unique',
    });
    await queryInterface.addIndex('citizens', ['organization_id', 'full_name'], {
      name: 'citizens_org_name_index',
    });
    await queryInterface.addIndex('citizens', ['organization_id', 'ward'], {
      name: 'citizens_org_ward_index',
    });
    await queryInterface.addIndex('citizens', ['organization_id', 'is_active', 'opted_out'], {
      name: 'citizens_org_contact_status_index',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('citizens');
  },
};
