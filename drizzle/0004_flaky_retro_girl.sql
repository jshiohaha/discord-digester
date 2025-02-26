ALTER TABLE "channels" ALTER COLUMN "channel_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "parent_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_backfilled_at" timestamp;