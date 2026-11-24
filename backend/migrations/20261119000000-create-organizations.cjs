'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organizations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED,
      },
      name: { allowNull: false, type: Sequelize.STRING(160) },
      code: { allowNull: false, unique: true, type: Sequelize.STRING(40) },
      address: { allowNull: true, type: Sequelize.TEXT },
      is_active: { allowNull: false, defaultValue: true, type: Sequelize.BOOLEAN },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('organizations');
  },
};
