ALTER TABLE "activities" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "status" SET DEFAULT 'upcoming'::text;--> statement-breakpoint
DROP TYPE "public"."activity_status";--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('upcoming', 'live', 'completed', 'canceled');--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "status" SET DEFAULT 'upcoming'::"public"."activity_status";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "status" SET DATA TYPE "public"."activity_status" USING "status"::"public"."activity_status";