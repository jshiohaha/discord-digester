import { Channel, ChannelType, Guild, GuildChannel } from "discord.js";

export const isPublicChannel = (channel: Channel, guild: Guild) =>
    channel instanceof GuildChannel
        ? (channel.permissionsFor(guild.roles.everyone)?.has("ViewChannel") ??
          false)
        : false;

/**
 * Regular Text Channels
 *
 * - Can have direct messages (channel.messages.fetch() works)
 * - Can optionally have threads
 * - Messages can exist both in the main channel and in threads
 */
export const isMessageBasedChannel = (channel: Channel) =>
    [
        ChannelType.GuildText, // Regular text channel
        ChannelType.DM, // Direct messages
        ChannelType.GroupDM, // Group direct messages
        ChannelType.GuildAnnouncement, // Announcement channel
        ChannelType.PublicThread, // Public thread in any channel
        ChannelType.PrivateThread, // Private thread
        ChannelType.AnnouncementThread, // Thread in announcement channel
    ].includes(channel.type);

/**
 * GuildForum channels
 *
 * - Cannot have direct messages (channel.messages.fetch() won't work)
 * - Every post creates a new thread
 * - Can only interact with messages through its threads
 */
export const isAllowableChannel = (channel: Channel) =>
    isMessageBasedChannel(channel) || channel.type === ChannelType.GuildForum;
