# Step-by-Step Deployment Guide

## Prerequisites
- PHP 7.0+ installed on your web server
- MySQL database access
- Web server (Apache/Nginx) configured

## Step 1: Prepare Your Database

1. Make sure your database and table exist:
   ```sql
   USE appUsers;
   DESCRIBE blackAngus;
   ```

2. Add a test license:
   ```sql
   INSERT INTO blackAngus (licenseKey, user, expires) 
   VALUES ('TEST-KEY-123', 'Test User', DATE_ADD(NOW(), INTERVAL 1 YEAR));
   ```

## Step 2: Deploy PHP Files

### Option A: Simple Method (Recommended for Quick Setup)

1. Upload `validate.php` to your web server (e.g., `public_html/api/` or `www/`)

2. Edit `validate.php` and update these lines (around line 27-30):
   ```php
   $dbHost = 'localhost';           // Usually 'localhost'
   $dbUser = 'your_db_user';        // Your MySQL username
   $dbPass = 'your_db_password';    // Your MySQL password
   $dbName = 'appUsers';            // Your database name
   ```

3. Upload `.htaccess` to the same directory (optional but recommended)

### Option B: Advanced Method (Better Security)

1. Upload `validate-advanced.php` to your server

2. Copy `config.example.php` to `config.php`:
   ```bash
   cp config.example.php config.php
   ```

3. Edit `config.php` with your database credentials:
   ```php
   return [
       'db' => [
           'host' => 'localhost',
           'name' => 'appUsers',
           'user' => 'your_db_user',
           'pass' => 'your_db_password',
           'charset' => 'utf8mb4'
       ]
   ];
   ```

4. Upload both `validate-advanced.php` and `config.php` to your server

5. Make sure `config.php` is NOT publicly accessible (outside web root or protected by .htaccess)

## Step 3: Set File Permissions

```bash
chmod 644 validate.php
chmod 644 .htaccess
chmod 600 config.php  # If using advanced method
```

## Step 4: Test the Endpoint

### Using curl:
```bash
curl -X POST https://your-domain.com/validate.php \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"TEST-KEY-123","machineId":"test-machine","appVersion":"1.0.0"}'
```

### Using browser (GET for quick test - won't work, but shows if file is accessible):
Visit: `https://your-domain.com/validate.php`
Should return: `{"valid":false,"error":"Method not allowed. Use POST."}`

### Expected Response (if license exists and is valid):
```json
{
  "valid": true,
  "userName": "Test User",
  "expiresAt": "2025-12-31T23:59:59+00:00"
}
```

## Step 5: Update Your Electron App

Update the license server URL in your Electron app. You have two options:

### Option A: Environment Variable (Recommended)
```bash
export LICENSE_SERVER_URL=https://your-domain.com/validate.php
npm start
```

### Option B: Edit Code Directly
Edit `main/license-manager.js` line 8:
```javascript
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://your-domain.com/validate.php';
```

## Step 6: Test License Activation

1. Start your Electron app
2. When prompted, enter a license key from your database (e.g., `TEST-KEY-123`)
3. The app should validate and activate

## Step 7: Verify Revocation Works

1. Delete or expire a license in your database:
   ```sql
   DELETE FROM blackAngus WHERE licenseKey = 'TEST-KEY-123';
   ```

2. In the Electron app, the license will be invalid on the next validation check (within 24 hours, or force with app restart)

## Common Issues

**"Database error"**
- Check database credentials are correct
- Verify database user has SELECT permissions
- Check PHP error logs: `tail -f /var/log/apache2/error.log` (or nginx error log)

**"License key not found" (but it exists in DB)**
- Check for whitespace: `SELECT TRIM(licenseKey) FROM blackAngus;`
- Verify case sensitivity (MySQL default is case-insensitive, but check your collation)
- Test query directly: `SELECT * FROM blackAngus WHERE licenseKey = 'TEST-KEY-123';`

**CORS errors**
- Make sure `.htaccess` is uploaded and working
- Or add CORS headers manually in PHP file

**500 Internal Server Error**
- Check PHP error logs
- Verify PHP version (needs 7.0+)
- Check PDO extension is enabled: `php -m | grep pdo`

## Security Checklist

- [ ] Database credentials are NOT in version control
- [ ] HTTPS is enabled (uncomment HTTPS redirect in .htaccess)
- [ ] File permissions are set correctly (config.php should be 600)
- [ ] .htaccess is protecting sensitive files
- [ ] Regular database backups
- [ ] Consider rate limiting for production

## Next Steps

- Set up monitoring/logging for license validations
- Implement rate limiting
- Add IP whitelisting if needed
- Set up automated backups
- Consider adding a management interface for license keys


