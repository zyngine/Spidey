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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sticky_roles (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_roles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id, role_id)
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

// --- Sticky Roles ---
async function addStickyRole(guildId, roleId) {
  await pool.query(
    `INSERT INTO sticky_roles (guild_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [guildId, roleId]
  );
}

async function removeStickyRole(guildId, roleId) {
  const res = await pool.query('DELETE FROM sticky_roles WHERE guild_id = $1 AND role_id = $2', [guildId, roleId]);
  return res.rowCount > 0;
}

async function getStickyRoles(guildId) {
  const res = await pool.query('SELECT role_id FROM sticky_roles WHERE guild_id = $1', [guildId]);
  return res.rows.map(r => r.role_id);
}

// --- Member Role Snapshots ---
async function saveMemberRoles(guildId, userId, roleIds) {
  // Clear old snapshot then insert new
  await pool.query('DELETE FROM member_roles WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  for (const roleId of roleIds) {
    await pool.query(
      `INSERT INTO member_roles (guild_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [guildId, userId, roleId]
    );
  }
}

async function getSavedMemberRoles(guildId, userId) {
  const res = await pool.query('SELECT role_id FROM member_roles WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return res.rows.map(r => r.role_id);
}

async function clearSavedMemberRoles(guildId, userId) {
  await pool.query('DELETE FROM member_roles WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
}

module.exports = {
  initDb, getApprovalChannel, setApprovalChannel,
  getAssignableRoles, isRoleAssignable, addAssignableRole, removeAssignableRole,
  addStickyRole, removeStickyRole, getStickyRoles,
  saveMemberRoles, getSavedMemberRoles, clearSavedMemberRoles
};
