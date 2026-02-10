const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// In-memory store for assignable roles (persists per session — see note below)
const assignableRoles = new Map();

client.once('ready', () => {
  console.log(`Spidey is online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // ---------- Slash Commands ----------
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'role') {
      const sub = interaction.options.getSubcommand();

      // --- /role request <role> <reason> ---
      if (sub === 'request') {
        const role = interaction.options.getRole('role');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!assignableRoles.has(role.id)) {
          return interaction.reply({ content: `**${role.name}** is not available for request. Use \`/role list\` to see what's available.`, ephemeral: true });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({ content: `You already have the **${role.name}** role.`, ephemeral: true });
        }

        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        const approvalChannel = interaction.guild.channels.cache.get(approvalChannelId);

        if (!approvalChannel) {
          return interaction.reply({ content: 'Approval channel not configured. Ask an admin to set `APPROVAL_CHANNEL_ID`.', ephemeral: true });
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

        if (!assignableRoles.has(role.id)) {
          return interaction.reply({ content: `**${role.name}** is not managed by Spidey.`, ephemeral: true });
        }

        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `Removed **${role.name}** from you.`, ephemeral: true });
      }

      // --- /role list ---
      if (sub === 'list') {
        if (assignableRoles.size === 0) {
          return interaction.reply({ content: 'No roles are currently available for request.', ephemeral: true });
        }

        const roleList = [...assignableRoles.values()]
          .map((r, i) => `${i + 1}. <@&${r.id}> — ${r.description}`)
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

        assignableRoles.set(role.id, { id: role.id, name: role.name, description });
        return interaction.reply({ content: `**${role.name}** is now available for request.`, ephemeral: true });
      }

      // --- /role remove-assignable <role> ---
      if (sub === 'remove-assignable') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'You need **Manage Roles** permission.', ephemeral: true });
        }

        const role = interaction.options.getRole('role');

        if (!assignableRoles.has(role.id)) {
          return interaction.reply({ content: `**${role.name}** is not in the assignable list.`, ephemeral: true });
        }

        assignableRoles.delete(role.id);
        return interaction.reply({ content: `**${role.name}** is no longer available for request.`, ephemeral: true });
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

client.login(process.env.DISCORD_TOKEN);
