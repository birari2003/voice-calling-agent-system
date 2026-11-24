/**
 * Rebuilds the integration-test database from migrations and seeders, then adds fixtures:
 * an Operator and an Auditor in the demo organization, and a second organization with its
 * own admin for isolation tests. Refuses to run against any database not ending in "_test".
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { TEST_PASSWORD, TEST_USERS } from './fixtures.js';

const database = process.env.DB_NAME ?? '';
if (!/^[a-z0-9_]+_test$/.test(database))
  throw new Error(`Refusing to reset "${database}": the test database name must end in _test.`);

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
await connection.query(
  `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await connection.end();

const run = (command: string) => execSync(command, { stdio: 'pipe', env: process.env });
run('npx sequelize-cli db:migrate');
run('npx sequelize-cli db:seed:all');
run('npx sequelize-cli --seeders-path bootstrap-seeders db:seed --seed create-super-admin.cjs');

const { Organization, Role, User } = await import('../../src/models/index.js');
const { sequelize } = await import('../../src/config/database.js');
const demo = await Organization.findOne({ where: { code: 'DEMO-MUNICIPAL' } });
const other = await Organization.create({
  name: 'Other Test Municipality',
  code: 'OTHER-TEST',
  isActive: true,
});
const hash = await bcrypt.hash(TEST_PASSWORD, 4);
for (const user of TEST_USERS) {
  const role = await Role.findOne({ where: { name: user.role } });
  await User.create({
    organizationId: user.otherOrganization ? other.id : demo!.id,
    roleId: role!.id,
    name: user.name,
    email: user.email,
    passwordHash: hash,
    isActive: true,
  });
}
await sequelize.close();
await rm(process.env.UPLOAD_DIR ?? './storage/test-uploads', { recursive: true, force: true });
console.log(`Integration database ${database} is ready.`);
