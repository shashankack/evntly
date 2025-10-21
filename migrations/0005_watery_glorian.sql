CREATE TYPE "public"."activity_type" AS ENUM('one-time', 'recurring');--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "type" SET DEFAULT 'one-time'::"public"."activity_type";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "type" SET DATA TYPE "public"."activity_type" USING "type"::"public"."activity_type";