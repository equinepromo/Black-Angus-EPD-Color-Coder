# Bulk Files Database Setup Guide

This guide explains how to set up the database-driven bulk files system, which replaces the static `manifest.json` file with a database-backed solution.

## Overview

Instead of maintaining a static `manifest.json` file on your server, you can now store bulk file metadata in a database. This provides:

- **Easier management**: Add/update bulk files directly in the database
- **No file uploads needed**: Just update database records
- **Consistent with license system**: Uses the same database and server setup
- **Better for admin interfaces**: Can build web interfaces to manage bulk files

## Database Setup

### 1. Create the Database Table

Run the SQL schema file to create the `bulkFiles` table:

```bash
mysql -u your_user -p appUsers < bulk-files-schema.sql
```

Or manually create the table:

```sql
CREATE TABLE IF NOT EXISTS bulkFiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fileId VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    size BIGINT DEFAULT 0,
    animalCount INT DEFAULT 0,
    category VARCHAR(255) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    isActive TINYINT(1) DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fileId (fileId),
    INDEX idx_isActive (isActive),
    INDEX idx_updatedAt (updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2. Configure the PHP Endpoint

1. **Update database credentials** in `get-manifest.php`:
   ```php
   $dbHost = 'localhost';
   $dbUser = 'your_db_user';      // UPDATE THIS
   $dbPass = 'your_db_password';  // UPDATE THIS
   $dbName = 'appUsers';
   ```

2. **Upload `get-manifest.php`** to your web server (same location as `validate.php`)

3. **Test the endpoint**:
   ```bash
   curl https://your-domain.com/get-manifest.php
   ```

   Expected response:
   ```json
   {
     "lastUpdated": "2025-12-25T00:20:56.477Z",
     "bulkFiles": []
   }
   ```

## Adding Bulk Files to Database

### Option 1: Direct SQL Insert

```sql
INSERT INTO bulkFiles (fileId, name, version, filename, url, size, animalCount, category, description) 
VALUES (
    'category-recommended-sires',
    'Category Recommended Sires',
    '1.0.0',
    'category-recommended-sires-v1.0.0.json',
    'https://scoring.westernsports.video/angus/bulk-files/category-recommended-sires-v1.0.0.json',
    1148389,
    52,
    'Recommended Sires',
    'Bulk file: category-recommended-sires'
);
```

### Option 2: Update Existing File

```sql
UPDATE bulkFiles 
SET 
    version = '1.1.0',
    filename = 'category-recommended-sires-v1.1.0.json',
    url = 'https://scoring.westernsports.video/angus/bulk-files/category-recommended-sires-v1.1.0.json',
    size = 1200000,
    animalCount = 55,
    updatedAt = NOW()
WHERE fileId = 'category-recommended-sires';
```

### Option 3: Deactivate a File (Hide from Users)

```sql
UPDATE bulkFiles 
SET isActive = 0 
WHERE fileId = 'old-bulk-file';
```

## Field Descriptions

- **fileId**: Unique identifier (e.g., "recommended-sires") - used by the app to track files
- **name**: Human-readable name shown to users
- **version**: Semantic version (e.g., "1.0.0", "1.1.0")
- **filename**: Actual filename on server (e.g., "recommended-sires-v1.0.0.json")
- **url**: Full HTTPS URL where the bulk file can be downloaded
- **size**: File size in bytes (optional but helpful)
- **animalCount**: Number of animals in the file
- **category**: Suggested category name for imported animals
- **description**: Description shown to users
- **isActive**: Set to 0 to hide from users without deleting

## Migrating from manifest.json

If you have an existing `manifest.json` file, you can migrate it to the database:

1. **Read your existing manifest.json**:
   ```bash
   cat manifest.json
   ```

2. **Convert each bulk file entry to SQL**:
   ```sql
   INSERT INTO bulkFiles (fileId, name, version, filename, url, size, animalCount, category, description)
   VALUES 
   ('category-recommended-sires', 'Category Recommended Sires', '1.0.0', ...),
   ('part-2', 'Part 2', '1.0.0', ...);
   ```

3. **Update the app** to use the new endpoint (already done in the code)

4. **Test** that the endpoint returns the same data as your manifest.json

## App Configuration

The app is already configured to use the database endpoint. The default URL is:

```
https://scoring.westernsports.video/angus/get-manifest.php
```

You can override this with the `BULK_FILE_MANIFEST_URL` environment variable if needed.

## Managing Bulk Files

### View All Active Files

```sql
SELECT * FROM bulkFiles WHERE isActive = 1 ORDER BY updatedAt DESC;
```

### View All Files (Including Inactive)

```sql
SELECT * FROM bulkFiles ORDER BY updatedAt DESC;
```

### Find Files Needing Updates

```sql
SELECT fileId, name, version, updatedAt 
FROM bulkFiles 
WHERE isActive = 1 
ORDER BY updatedAt ASC;
```

### Delete a Bulk File Entry

```sql
DELETE FROM bulkFiles WHERE fileId = 'old-file-id';
```

Or deactivate instead (recommended):
```sql
UPDATE bulkFiles SET isActive = 0 WHERE fileId = 'old-file-id';
```

## Troubleshooting

### Endpoint Returns Empty Array

- Check that `isActive = 1` for your files
- Verify database connection in `get-manifest.php`
- Check PHP error logs

### App Can't Fetch Manifest

- Verify the endpoint URL is correct
- Test with `curl` to see if endpoint is accessible
- Check CORS headers (should allow all origins)
- Check PHP error logs

### Files Not Showing in App

- Verify `isActive = 1` in database
- Check that the endpoint returns the file in the response
- Clear app cache and restart app
- Check app console logs for errors

## Security Recommendations

1. **Use HTTPS** for the endpoint
2. **Restrict database access** - only allow the web server user to read from `bulkFiles` table
3. **Consider authentication** if you want to restrict who can add/update bulk files
4. **Validate URLs** - ensure URLs point to your domain
5. **Sanitize inputs** - if building an admin interface, validate all inputs

## Example: Complete Workflow

1. **Create bulk file** using the app or script
2. **Upload file** to server: `https://scoring.westernsports.video/angus/bulk-files/my-file-v1.0.0.json`
3. **Add to database**:
   ```sql
   INSERT INTO bulkFiles (fileId, name, version, filename, url, size, animalCount, category, description)
   VALUES ('my-file', 'My Bulk File', '1.0.0', 'my-file-v1.0.0.json', 
           'https://scoring.westernsports.video/angus/bulk-files/my-file-v1.0.0.json',
           1000000, 100, 'My Category', 'Description here');
   ```
4. **Users see it** in the app automatically (no manifest.json update needed!)

## Future Enhancements

Potential improvements you could add:

- Admin web interface for managing bulk files
- Automatic file size/animal count detection
- Version history tracking
- Download statistics
- Scheduled file updates
- File validation before activation


