ALTER TABLE "clubs" ADD COLUMN "slug" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_slug_unique" UNIQUE("slug");