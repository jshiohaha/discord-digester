ALTER TABLE "channels" ADD COLUMN "created_at" timestamp;--> statement-breakpoint
ALTER TABLE "channels" DROP COLUMN IF EXISTS "last_backfilled_at";