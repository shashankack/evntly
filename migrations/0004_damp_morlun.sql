ALTER TABLE "activities" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "club_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "activity_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_schedules" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activity_schedules" ALTER COLUMN "activity_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "club_members" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "club_members" ALTER COLUMN "club_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "club_members" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "organizer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "organizers" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "organizers" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "registration_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "start_date_time" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "end_date_time" timestamp;--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "recurring_id";