# License Server Deployment Guide

## Quick Start

### Option 1: Simple Deployment (validate.php)

1. **Update database credentials** in `validate.php`:
   ```php
   $dbHost = 'localhost';
   $dbUser = 'your_db_user';      // UPDATE THIS
   $dbPass = 'your_db_password';  // UPDATE THIS
   $dbName = 'appUsers';
   ```

2. **Upload files** to your web server:
   - `validate.php` - Main validation endpoint
   - `.htaccess` - Optional security and CORS settings

3. **Test the endpoint**:
   ```bash
   curl -X POST https://your-domain.com/validate.php \
     -H "Content-Type: application/json" \
     -d '{"licenseKey":"TEST_KEY","machineId":"test","appVersion":"1.0.0"}'
   ```

4. **Update app configuration**:
   ```bash
   export LICENSE_SERVER_URL=https://your-domain.com/validate.php
   ```

### Option 2: Advanced Deployment (validate-advanced.php)

1. **Copy config example**:
   ```bash
   cp config.example.php config.php
   ```

2. **Update config.php** with your database credentials

3. **Upload files**:
   - `validate-advanced.php` (or rename to `validate.php`)
   - `config.php` (keep this private, don't commit to git)
   - `.htaccess`

4. **Use the same endpoint URL** in your app configuration

## Database Setup

Your database structure should match:

```sql
CREATE DATABASE appUsers;

CREATE TABLE blackAngus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    licenseKey VARCHAR(255) UNIQUE NOT NULL,
    user VARCHAR(255),
    expires DATETIME,
    INDEX idx_licenseKey (licenseKey)
);
```

### Sample Data

```sql
INSERT INTO blackAngus (licenseKey, user, expires) VALUES
('TEST-LICENSE-123', 'John Doe', '2025-12-31 23:59:59'),
('DEMO-KEY-456', 'Jane Smith', NULL);
```

## Security Recommendations

1. **Use HTTPS** in production (uncomment HTTPS redirect in `.htaccess`)

2. **Restrict CORS** if you know your app's origin:
   ```php
   header('Access-Control-Allow-Origin: https://your-app-domain.com');
   ```

3. **Protect config.php** - Don't commit it to version control

4. **Use environment variables** for database credentials (if possible):
   ```php
   $dbUser = getenv('DB_USER') ?: 'fallback_user';
   $dbPass = getenv('DB_PASS') ?: 'fallback_pass';
   ```

5. **Rate limiting** - Consider adding rate limiting to prevent abuse

6. **IP whitelisting** - Optionally restrict access to known IPs

## Testing

Test with valid license:
```bash
curl -X POST https://your-domain.com/validate.php \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"TEST-LICENSE-123","machineId":"test","appVersion":"1.0.0"}'
```

Test with invalid license:
```bash
curl -X POST https://your-domain.com/validate.php \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"INVALID-KEY","machineId":"test","appVersion":"1.0.0"}'
```

Expected responses:

**Valid:**
```json
{
  "valid": true,
  "userName": "John Doe",
  "expiresAt": "2025-12-31T23:59:59+00:00"
}
```

**Invalid:**
```json
{
  "valid": false,
  "error": "License key not found"
}
```

## Machine Binding (One License Per Machine)

The license system now supports machine binding to ensure each license can only be used on one computer at a time.

### Setup

1. **Add the `activeMachineId` column to your database:**
   ```sql
   ALTER TABLE blackAngus ADD COLUMN activeMachineId VARCHAR(255) NULL AFTER expires;
   ```

   Or run the provided SQL file:
   ```bash
   mysql -u your_user -p appUsers < add-machine-binding.sql
   ```

2. **How it works:**
   - When a license is validated, it binds to the requesting machine's hostname
   - If another machine tries to use the same license, validation fails
   - Error message: "License is already in use on another computer"

### Releasing a License

If a user needs to switch computers, you can release a license using the `release-license.php` endpoint:

```bash
curl -X POST https://your-domain.com/release-license.php \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"USER_LICENSE_KEY"}'
```

Or manually in the database:
```sql
UPDATE blackAngus SET activeMachineId = NULL WHERE licenseKey = 'USER_LICENSE_KEY';
```

### Viewing Bound Licenses

To see which licenses are currently bound to machines:
```sql
SELECT licenseKey, user, activeMachineId, expires 
FROM blackAngus 
WHERE activeMachineId IS NOT NULL;
```

## Revoking Licenses

To revoke access, simply delete or mark the license as invalid in your database:

```sql
-- Delete the license
DELETE FROM blackAngus WHERE licenseKey = 'REVOKED-KEY';

-- Or update expires to past date
UPDATE blackAngus SET expires = '2020-01-01 00:00:00' WHERE licenseKey = 'REVOKED-KEY';
```

The app will check the license within 24 hours and block access if it's invalid.

## Troubleshooting

**500 Internal Server Error:**
- Check database credentials
- Check PHP error logs
- Verify database connection works

**405 Method Not Allowed:**
- Make sure you're using POST request
- Check .htaccess isn't blocking requests

**License not found even though it exists:**
- Check for extra spaces in license key
- Verify case sensitivity
- Check database charset/collation

