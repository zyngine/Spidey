const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Bot configuration')
    .addSubcommand(sub =>
      sub.setName('approval-channel')
        .setDescription('Set the channel where role requests are sent for approval')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The approval channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Role request system')
    .addSubcommand(sub =>
      sub.setName('request')
        .setDescription('Request a role')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to request').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Why you want this role'))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from yourself')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all available roles')
    )
    .addSubcommand(sub =>
      sub.setName('add-assignable')
        .setDescription('Make a role requestable (Admin)')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to make requestable').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Description for the role'))
    )
    .addSubcommand(sub =>
      sub.setName('remove-assignable')
        .setDescription('Remove a role from the requestable list (Admin)')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove from the list').setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Sticky role management')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Make a role sticky (re-applied when members rejoin)')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to make sticky').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from the sticky list')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all sticky roles')
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering global slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Global slash commands registered successfully.');
  } catch (error) {
    console.error(error);
  }
})();
