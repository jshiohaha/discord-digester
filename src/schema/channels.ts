import {
    boolean,
    pgTable,
    serial,
    text,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";

export const channels = pgTable("channels", {
    id: serial("id").primaryKey(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    channelId: varchar("channel_id", { length: 64 }).unique().notNull(),
    name: text("name").notNull(),
    isPublic: boolean("is_public").notNull(),
    allowed: boolean("allowed").default(false).notNull(),
    type: text("type").notNull(),
    parentId: varchar("parent_id", { length: 64 }),
});
