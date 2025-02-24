import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    pgTable,
    serial,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

export const messages = pgTable(
    "messages",
    {
        id: serial("id").primaryKey(),
        messageId: text("message_id").notNull().unique(),
        channelId: text("channel_id").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        content: text("content"),
        replyTo: text("reply_to"),
        // thread
        threadId: text("thread_id"),
        threadParentChannelId: text("thread_parent_channel_id"),
        threadName: text("thread_name"),
        // user
        authorId: text("author_id").notNull(),
        authorUsername: text("author_username").notNull(),
        authorAvatarUrl: text("author_avatar_url"),
        authorIsBot: boolean("author_is_bot").default(false).notNull(),
        authorIsSystem: boolean("author_is_system").default(false).notNull(),
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
