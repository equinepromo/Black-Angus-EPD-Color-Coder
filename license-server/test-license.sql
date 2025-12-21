-- Test data for license validation
-- Run these queries to add test licenses to your database

-- Add a valid license that expires in 1 year
INSERT INTO blackAngus (licenseKey, user, expires) 
VALUES ('TEST-LICENSE-123', 'Test User', DATE_ADD(NOW(), INTERVAL 1 YEAR));

-- Add a valid license with no expiration (perpetual)
INSERT INTO blackAngus (licenseKey, user, expires) 
VALUES ('DEMO-KEY-456', 'Demo User', NULL);

-- Add an expired license (for testing expiration logic)
INSERT INTO blackAngus (licenseKey, user, expires) 
VALUES ('EXPIRED-KEY-789', 'Expired User', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- Verify the data
SELECT id, licenseKey, user, expires, 
       CASE 
         WHEN expires IS NULL THEN 'No expiration'
         WHEN expires > NOW() THEN 'Valid'
         ELSE 'Expired'
       END AS status
FROM blackAngus;


