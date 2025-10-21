ALTER TABLE "activities" ADD COLUMN "slug" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_slug_unique" UNIQUE("slug");