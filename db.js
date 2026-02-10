const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      approval_channel_id TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignable_roles (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      description TEXT DEFAULT 'No description',
      PRIMARY KEY (guild_id, role_id)
    )
  `);
  console.log('Database tables ready.');
}

async function getApprovalChannel(guildId) {
  const res = await pool.query('SELECT approval_channel_id FROM guild_config WHERE guild_id = $1', [guildId]);
  return res.rows[0]?.approval_channel_id || null;
}

async function setApprovalChannel(guildId, channelId) {
  await pool.query(
    `INSERT INTO guild_config (guild_id, approval_channel_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET approval_channel_id = $2`,
    [guildId, channelId]
  );
}

async function getAssignableRoles(guildId) {
  const res = await pool.query('SELECT role_id, role_name, description FROM assignable_roles WHERE guild_id = $1', [guildId]);
  return res.rows;
}

async function isRoleAssignable(guildId, roleId) {
  const res = await pool.query('SELECT 1 FROM assignable_roles WHERE guild_id = $1 AND role_id = $2', [guildId, roleId]);
  return res.rows.length > 0;
}

async function addAssignableRole(guildId, roleId, roleName, description) {
  await pool.query(
    `INSERT INTO assignable_roles (guild_id, role_id, role_name, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, role_id) DO UPDATE SET role_name = $3, description = $4`,
    [guildId, roleId, roleName, description]
  );
}

async function removeAssignableRole(guildId, roleId) {
  const res = await pool.query('DELETE FROM assignable_roles WHERE guild_id = $1 AND role_id = $2', [guildId, roleId]);
  return res.rowCount > 0;
}

module.exports = { initDb, getApprovalChannel, setApprovalChannel, getAssignableRoles, isRoleAssignable, addAssignableRole, removeAssignableRole };
