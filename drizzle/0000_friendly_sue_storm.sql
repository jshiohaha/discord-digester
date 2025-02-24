CREATE TABLE IF NOT EXISTS "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"channel_id" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"is_public" boolean NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "channels_channel_id_unique" UNIQUE("channel_id")
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
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"content" text,
	"reply_to" text,
	"thread_id" text,
	"thread_parent_channel_id" text,
	"thread_name" text,
	"author_id" text NOT NULL,
	"author_username" text NOT NULL,
	"author_avatar_url" text,
	"author_is_bot" boolean DEFAULT false NOT NULL,
	"author_is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel" ON "messages" ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread" ON "messages" ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thread_parent" ON "messages" ("thread_parent_channel_id");