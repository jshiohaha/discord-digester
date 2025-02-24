import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const textBasedChannelCheckpointer = pgTable(
    "text_based_channel_checkpoint",
    {
        channelId: text("channel_id").primaryKey(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
        lastMessageId: text("last_message_id"),
        status: text("status").default("pending"),
    }
);

export const threadBasedChannelCheckpointer = pgTable(
    "thread_based_channel_checkpoint",
    {
        channelId: text("channel_id").primaryKey(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
        threadId: text("thread_id"),
        lastMessageId: text("last_message_id"),
        status: text("status").default("pending"),
        finishedAt: timestamp("finished_at"),
    }
);
