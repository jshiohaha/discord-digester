ALTER TABLE "channels" RENAME COLUMN "created_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "guild_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "reply_to";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "thread_name";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author_username";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author_avatar_url";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author_is_bot";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "author_is_system";