-- Add licenseType field to blackAngus table for feature flags
-- This allows different license types (e.g., 'admin', 'standard') to enable/disable features

ALTER TABLE blackAngus ADD COLUMN licenseType VARCHAR(50) DEFAULT 'standard' COMMENT 'License type: standard, admin, etc.';

-- Update existing licenses to 'standard' by default
UPDATE blackAngus SET licenseType = 'standard' WHERE licenseType IS NULL;

-- Example: Set a specific license to 'admin' type
-- UPDATE blackAngus SET licenseType = 'admin' WHERE licenseKey = 'YOUR-ADMIN-LICENSE-KEY';


