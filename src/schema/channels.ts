import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    pgTable,
    serial,
    text,
    timestamp,
} from "drizzle-orm/pg-core";
import { guilds } from "./guilds";

export const channels = pgTable(
    "channels",
    {
        id: serial("id").primaryKey(),
        createdAt: timestamp("created_at"),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        guildId: text("guild_id").notNull(),
        channelId: text("channel_id").notNull(),
        name: text("name").notNull(),
        isPublic: boolean("is_public").notNull(),
        allowed: boolean("allowed").default(false).notNull(),
        // todo: change to numeric enum, maybe another for semantic interpretation
        type: text("type").notNull(),
        parentId: text("parent_id"),
    },
    (table) => ({
        channelIdIdx: index("idx_channel_id").on(table.channelId),
        guildIdIdx: index("idx_channels_guild_id").on(table.guildId),
        uniqueChannelPerGuild: index("idx_unique_channel_guild").on(
            table.channelId,
            table.guildId
        ),
    })
);

export const channelsRelations = relations(channels, ({ one }) => ({
    guild: one(guilds, {
        fields: [channels.guildId],
        references: [guilds.guildId],
    }),
}));
