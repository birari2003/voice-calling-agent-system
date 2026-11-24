require('dotenv').config({ path: '.env' });

// One configuration, read from the environment, used for every NODE_ENV
// (development, test and production differ only in their environment variables).
const config = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_data',
};

module.exports = { development: config, test: config, production: config };
