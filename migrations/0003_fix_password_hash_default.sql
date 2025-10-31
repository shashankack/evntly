-- Remove the default empty string from password_hash if it exists
-- and ensure the column allows NULL values
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
