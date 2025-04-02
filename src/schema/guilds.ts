import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    jsonb,
    pgTable,
    serial,
    text,
    timestamp,
} from "drizzle-orm/pg-core";
import { channels } from "./channels";
import { messages } from "./messages";

export const guilds = pgTable(
    "guilds",
    {
        id: serial("id").primaryKey(),
        createdAt: timestamp("created_at").notNull(),
        addedAt: timestamp("added_at").defaultNow().notNull(),
        guildId: text("guild_id").notNull().unique(),
        name: text("name").notNull(),
        iconUrl: text("icon_url"),
        active: boolean("active").default(true).notNull(),
        raw: jsonb("raw"),
    },
    (table) => ({
        guildIdIdx: index("idx_guild_id").on(table.guildId),
    })
);

// Relations with other tables
export const guildRelations = relations(guilds, ({ many }) => ({
    channels: many(channels),
    messages: many(messages),
}));
