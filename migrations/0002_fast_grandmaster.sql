ALTER TABLE "organizers" ALTER COLUMN "secret_key" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "organizers" ADD COLUMN "organizer_email" varchar(255) NOT NULL;