ALTER TABLE "activities" ADD COLUMN "pricing_config" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD COLUMN "seat_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD COLUMN "total_amount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD COLUMN "selected_add_ons" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD COLUMN "fee_breakdown" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "amount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fee_breakdown" jsonb DEFAULT '{}';--> statement-breakpoint