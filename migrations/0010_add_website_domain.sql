-- Add website_domain column to organizers table
ALTER TABLE organizers ADD COLUMN website_domain varchar(255);

-- Create index for faster domain lookups
CREATE INDEX idx_organizers_website_domain ON organizers (website_domain);

-- Add comment
COMMENT ON COLUMN organizers.website_domain IS 'Website domain for origin-based organizer scoping';
