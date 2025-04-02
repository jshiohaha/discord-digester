CREATE TABLE IF NOT EXISTS "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"is_public" boolean NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	"type" text NOT NULL,
	"parent_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "text_based_channel_checkpoint" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_message_id" text,
	"status" text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thread_based_channel_checkpoint" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"thread_id" text,
	"last_message_id" text,
	"status" text DEFAULT 'pending',
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guilds" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"icon_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb,
	CONSTRAINT "guilds_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"thread_parent_channel_id" text,
	"message_id" text NOT NULL,
	"content" text,
	"reply_to" text,
	"author" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_id" ON "channels" ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channels_guild_id" ON "channels" ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_unique_channel_guild" ON "channels" ("channel_id","guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guild_id" ON "guilds" ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel" ON "messages" ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guild" ON "messages" ("guild_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread" ON "messages" ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_parent" ON "messages" ("thread_parent_channel_id");