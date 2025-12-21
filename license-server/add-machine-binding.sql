-- Add machine binding column to blackAngus table
-- This allows tracking which machine is currently using each license

ALTER TABLE blackAngus 
ADD COLUMN activeMachineId VARCHAR(255) NULL 
AFTER expires;

-- Add index for faster lookups (optional but recommended)
CREATE INDEX idx_activeMachineId ON blackAngus(activeMachineId);

-- Add comment to column
ALTER TABLE blackAngus 
MODIFY COLUMN activeMachineId VARCHAR(255) NULL 
COMMENT 'Machine ID (hostname) of the computer currently using this license';

-- Example: View licenses with their bound machines
-- SELECT licenseKey, user, activeMachineId, expires FROM blackAngus WHERE activeMachineId IS NOT NULL;


