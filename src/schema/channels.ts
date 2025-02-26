import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const channels = pgTable("channels", {
    id: serial("id").primaryKey(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    channelId: text("channel_id").unique().notNull(),
    name: text("name").notNull(),
    isPublic: boolean("is_public").notNull(),
    allowed: boolean("allowed").default(false).notNull(),
    type: text("type").notNull(),
    parentId: text("parent_id"),
});
