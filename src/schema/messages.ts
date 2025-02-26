import { relations } from "drizzle-orm";
import {
    index,
    jsonb,
    pgTable,
    serial,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

export const messages = pgTable(
    "messages",
    {
        id: serial("id").primaryKey(),
        // this is the actual message creation timestamp
        createdAt: timestamp("created_at").notNull(),
        guildId: text("guild_id"),
        channelId: text("channel_id").notNull(),
        threadId: text("thread_id"),
        threadParentChannelId: text("thread_parent_channel_id"),
        messageId: text("message_id").notNull().unique(),
        // mapped from discord's `cleanContent` field
        content: text("content"),
        replyTo: text("reply_to"),
        author: jsonb("author").notNull(),
        raw: jsonb("raw").notNull(),
    },
    (table) => ({
        channelIdx: index("idx_channel").on(table.channelId),
        threadIdx: index("idx_thread").on(table.threadId),
        threadParentIdx: index("idx_thread_parent").on(
            table.threadParentChannelId
        ),
    })
);

export const replyToRelation = relations(messages, ({ one }) => ({
    replyTo: one(messages, {
        fields: [messages.replyTo],
        references: [messages.messageId],
    }),
}));
