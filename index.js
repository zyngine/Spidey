const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const {
  initDb, getApprovalChannel, setApprovalChannel,
  getAssignableRoles, isRoleAssignable, addAssignableRole, removeAssignableRole,
  addStickyRole, removeStickyRole, getStickyRoles,
  saveMemberRoles, getSavedMemberRoles, clearSavedMemberRoles
} = require('./db');
require('dotenv').config();

const port = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('Spidey is running'); }).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  await initDb();
  console.log(`Spidey is online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;

  const guildId = interaction.guild.id;

  // ---------- Slash Commands ----------
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // --- /config approval-channel ---
    if (commandName === 'config') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'You need **Manage Server** permission.', ephemeral: true });
      }

      const channel = interaction.options.getChannel('channel');

      if (!channel.isTextBased()) {
        return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
      }

      await setApprovalChannel(guildId, channel.id);
      return interaction.reply({ content: `Approval channel set to ${channel}.`, ephemeral: true });
    }

    if (commandName === 'role') {
      const sub = interaction.options.getSubcommand();

      // --- /role request <role> <reason> ---
      if (sub === 'request') {
        const role = interaction.options.getRole('role');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!(await isRoleAssignable(guildId, role.id))) {
          return interaction.reply({ content: `**${role.name}** is not available for request. Use \`/role list\` to see what's available.`, ephemeral: true });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({ content: `You already have the **${role.name}** role.`, ephemeral: true });
        }

        const approvalChannelId = await getApprovalChannel(guildId);
        if (!approvalChannelId) {
          return interaction.reply({ content: 'Approval channel not configured. Ask an admin to run `/config approval-channel`.', ephemeral: true });
        }

        const approvalChannel = interaction.guild.channels.cache.get(approvalChannelId);
        if (!approvalChannel) {
          return interaction.reply({ content: 'Approval channel no longer exists. Ask an admin to run `/config approval-channel`.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('Role Request')
          .setColor(0xE74C3C)
          .addFields(
            { name: 'User', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_${interaction.user.id}_${role.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_${interaction.user.id}_${role.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );

        await approvalChannel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `Your request for **${role.name}** has been submitted for approval.`, ephemeral: true });
      }

      // --- /role remove <role> ---
      if (sub === 'remove') {
        const role = interaction.options.getRole('role');

        if (!interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({ content: `You don't have the **${role.name}** role.`, ephemeral: true });
        }

        if (!(await isRoleAssignable(guildId, role.id))) {
          return interaction.reply({ content: `**${role.name}** is not managed by Spidey.`, ephemeral: true });
        }

        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `Removed **${role.name}** from you.`, ephemeral: true });
      }

      // --- /role list ---
      if (sub === 'list') {
        const roles = await getAssignableRoles(guildId);

        if (roles.length === 0) {
          return interaction.reply({ content: 'No roles are currently available for request.', ephemeral: true });
        }

        const roleList = roles
          .map((r, i) => `${i + 1}. <@&${r.role_id}> — ${r.description}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle('Available Roles')
          .setColor(0x3498DB)
          .setDescription(roleList);

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // --- /role add-assignable <role> <description> ---
      if (sub === 'add-assignable') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'You need **Manage Roles** permission.', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const description = interaction.options.getString('description') || 'No description';

        await addAssignableRole(guildId, role.id, role.name, description);
        return interaction.reply({ content: `**${role.name}** is now available for request.`, ephemeral: true });
      }

      // --- /role remove-assignable <role> ---
      if (sub === 'remove-assignable') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'You need **Manage Roles** permission.', ephemeral: true });
        }

        const role = interaction.options.getRole('role');

        const removed = await removeAssignableRole(guildId, role.id);
        if (!removed) {
          return interaction.reply({ content: `**${role.name}** is not in the assignable list.`, ephemeral: true });
        }

        return interaction.reply({ content: `**${role.name}** is no longer available for request.`, ephemeral: true });
      }
    }

    // --- /sticky ---
    if (commandName === 'sticky') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({ content: 'You need **Manage Roles** permission.', ephemeral: true });
      }

      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const role = interaction.options.getRole('role');
        await addStickyRole(guildId, role.id);
        return interaction.reply({ content: `**${role.name}** is now a sticky role. It will be re-applied when members rejoin.`, ephemeral: true });
      }

      if (sub === 'remove') {
        const role = interaction.options.getRole('role');
        const removed = await removeStickyRole(guildId, role.id);
        if (!removed) {
          return interaction.reply({ content: `**${role.name}** is not a sticky role.`, ephemeral: true });
        }
        return interaction.reply({ content: `**${role.name}** is no longer sticky.`, ephemeral: true });
      }

      if (sub === 'list') {
        const stickyIds = await getStickyRoles(guildId);
        if (stickyIds.length === 0) {
          return interaction.reply({ content: 'No sticky roles configured.', ephemeral: true });
        }
        const list = stickyIds.map((id, i) => `${i + 1}. <@&${id}>`).join('\n');
        const embed = new EmbedBuilder()
          .setTitle('Sticky Roles')
          .setColor(0x3498DB)
          .setDescription(list)
          .setFooter({ text: 'These roles are re-applied when members rejoin the server' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }

  // ---------- Button Interactions (Approve / Deny) ----------
  if (interaction.isButton()) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: 'You need **Manage Roles** permission to handle requests.', ephemeral: true });
    }

    const [action, userId, roleId] = interaction.customId.split('_');

    if (action !== 'approve' && action !== 'deny') return;

    const guild = interaction.guild;
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = guild.roles.cache.get(roleId);

    if (!member) {
      return interaction.reply({ content: 'User is no longer in the server.', ephemeral: true });
    }

    if (!role) {
      return interaction.reply({ content: 'Role no longer exists.', ephemeral: true });
    }

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    if (action === 'approve') {
      await member.roles.add(role);
      updatedEmbed
        .setColor(0x2ECC71)
        .addFields({ name: 'Status', value: `Approved by ${interaction.user}` });

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      await member.send(`Your request for **${role.name}** has been **approved**.`).catch(() => {});
    }

    if (action === 'deny') {
      updatedEmbed
        .setColor(0x95A5A6)
        .addFields({ name: 'Status', value: `Denied by ${interaction.user}` });

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      await member.send(`Your request for **${role.name}** has been **denied**.`).catch(() => {});
    }
  }
});

// ---------- Sticky Roles: Save on Leave ----------
client.on('guildMemberRemove', async (member) => {
  try {
    const stickyIds = await getStickyRoles(member.guild.id);
    if (stickyIds.length === 0) return;

    const memberStickyRoles = member.roles.cache
      .filter(r => stickyIds.includes(r.id))
      .map(r => r.id);

    if (memberStickyRoles.length > 0) {
      await saveMemberRoles(member.guild.id, member.id, memberStickyRoles);
      console.log(`Saved ${memberStickyRoles.length} sticky role(s) for ${member.user.tag}`);
    }
  } catch (err) {
    console.error('Error saving sticky roles on member leave:', err);
  }
});

// ---------- Sticky Roles: Restore on Rejoin ----------
client.on('guildMemberAdd', async (member) => {
  try {
    const savedRoles = await getSavedMemberRoles(member.guild.id, member.id);
    if (savedRoles.length === 0) return;

    const rolesToAdd = savedRoles.filter(id => member.guild.roles.cache.has(id));
    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd);
      console.log(`Restored ${rolesToAdd.length} sticky role(s) for ${member.user.tag}`);
    }

    await clearSavedMemberRoles(member.guild.id, member.id);
  } catch (err) {
    console.error('Error restoring sticky roles on member join:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
