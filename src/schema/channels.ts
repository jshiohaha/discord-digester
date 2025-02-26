import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const channels = pgTable("channels", {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    channelId: text("channel_id").unique().notNull(),
    name: text("name").notNull(),
    isPublic: boolean("is_public").notNull(),
    allowed: boolean("allowed").default(false).notNull(),
    // todo: change to numeric enum, maybe another for semantic interpretation
    type: text("type").notNull(),
    parentId: text("parent_id"),
});
