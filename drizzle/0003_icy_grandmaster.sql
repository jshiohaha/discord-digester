ALTER TABLE "messages" ALTER COLUMN "raw" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author" jsonb NOT NULL;