# Bulk File Server Setup Guide

This guide walks you through setting up your server to distribute bulk files to users.

## Overview

The app checks for bulk files from a manifest file hosted on your server. The manifest lists all available bulk files, and users can import them through the "Bulk Files" tab in the app.

## Server Structure

Your server should have the following structure:

```
https://scoring.westernsports.video/angus/bulk-files/
├── manifest.json              (List of all available bulk files)
├── recommended-sires-v1.0.0.json
├── recommended-sires-v1.1.0.json
├── sale-bulls-v1.0.0.json
└── ... (other bulk files)
```

## Step 1: Create the Directory Structure

On your server, create the directory:
```
/angus/bulk-files/
```

Make sure this directory is web-accessible (can be accessed via HTTP/HTTPS).

## Step 2: Create Bulk Files

You have two options to create bulk files:

### Option A: Export from the App (Recommended)

1. In the app, go to **Herd Inventory** tab
2. Select animals you want to export (using checkboxes) OR select a category from the dropdown
3. Click **"Export Selected to Bulk File"** or **"Export Category to Bulk File"**
4. Fill in the export dialog:
   - **Version**: e.g., `1.0.0`
   - **Type/Name**: e.g., `recommended-sires`
   - **Description**: (optional) e.g., "Curated list of recommended sires"
5. Save the file - it will be named like `recommended-sires-v1.0.0.json`

### Option B: Use the Command-Line Script

```bash
node scripts/create-bulk-file.js \
  --source cache/ \
  --output recommended-sires-v1.0.0.json \
  --version 1.0.0 \
  --type recommended-sires \
  --category "Recommended Sires" \
  --filter "sex=BULL"
```

The script will create a properly formatted bulk file from your cache directory.

## Step 3: Upload Bulk Files to Server

Upload your bulk JSON files to:
```
https://scoring.westernsports.video/angus/bulk-files/recommended-sires-v1.0.0.json
```

Make sure files are publicly accessible (no authentication required for downloads).

## Step 4: Create the Manifest File

Create a file called `manifest.json` in the `/angus/bulk-files/` directory with this structure:

```json
{
  "lastUpdated": "2024-01-15T12:00:00Z",
  "bulkFiles": [
    {
      "id": "recommended-sires",
      "name": "Recommended Sires",
      "version": "1.0.0",
      "filename": "recommended-sires-v1.0.0.json",
      "url": "https://scoring.westernsports.video/angus/bulk-files/recommended-sires-v1.0.0.json",
      "size": 5242880,
      "animalCount": 500,
      "category": "Recommended Sires",
      "description": "Curated list of recommended sires from Angus"
    },
    {
      "id": "sale-bulls",
      "name": "Sale Bulls",
      "version": "1.0.0",
      "filename": "sale-bulls-v1.0.0.json",
      "url": "https://scoring.westernsports.video/angus/bulk-files/sale-bulls-v1.0.0.json",
      "size": 3145728,
      "animalCount": 300,
      "category": "Sale Bulls",
      "description": "Bulls available for sale"
    }
  ]
}
```

### Manifest Fields Explained

- **lastUpdated**: ISO 8601 timestamp of when the manifest was last updated
- **bulkFiles**: Array of bulk file objects, each with:
  - **id**: Unique identifier (no spaces, use hyphens) - e.g., `"recommended-sires"`
  - **name**: Human-readable name - e.g., `"Recommended Sires"`
  - **version**: Semantic version - e.g., `"1.0.0"`
  - **filename**: The actual filename - e.g., `"recommended-sires-v1.0.0.json"`
  - **url**: Full HTTPS URL to the bulk file
  - **size**: File size in bytes (optional, but helpful)
  - **animalCount**: Number of animals in the file
  - **category**: Suggested category name for the animals
  - **description**: Description of what this bulk file contains

### Getting File Size

To get the file size in bytes:
```bash
# On Linux/Mac:
stat -f%z recommended-sires-v1.0.0.json

# Or:
ls -l recommended-sires-v1.0.0.json
```

## Step 5: Upload Manifest to Server

Upload `manifest.json` to:
```
https://scoring.westernsports.video/angus/bulk-files/manifest.json
```

Make sure it's publicly accessible and returns proper `Content-Type: application/json` header.

## Step 6: Verify Access

Test that your files are accessible:

```bash
# Test manifest
curl https://scoring.westernsports.video/angus/bulk-files/manifest.json

# Test bulk file
curl -I https://scoring.westernsports.video/angus/bulk-files/recommended-sires-v1.0.0.json
```

Both should return HTTP 200 OK.

## Step 7: Users Can Now Import

Users will:
1. Open the app and go to the **"Bulk Files"** tab
2. Click **"Check for Updates"**
3. See available bulk files and their status
4. Click **"Import"** or **"Update"** for any file they want
5. Choose import options (category assignment, update strategy, etc.)
6. The app downloads and processes the file automatically

## Updating Bulk Files

### To Update an Existing Bulk File:

1. **Create the new version** using the app or script:
   - Export again with a new version number (e.g., `1.1.0`)
   - Save as `recommended-sires-v1.1.0.json`

2. **Upload the new file** to your server:
   ```
   https://scoring.westernsports.video/angus/bulk-files/recommended-sires-v1.1.0.json
   ```

3. **Update the manifest.json**:
   - Change the `version` field to `"1.1.0"`
   - Update the `filename` to `"recommended-sires-v1.1.0.json"`
   - Update the `url` to point to the new file
   - Update `lastUpdated` timestamp
   - Update `size` and `animalCount` if they changed

4. **Upload the updated manifest.json**

Users will see "Update Available" for that file and can import the new version.

### To Add a New Bulk File:

1. Create and upload the bulk file
2. Add a new entry to the `bulkFiles` array in `manifest.json`
3. Upload the updated manifest

## Server Configuration Tips

### CORS Headers (if needed)

If you encounter CORS issues, make sure your server returns these headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Content-Type
```

### Content-Type Headers

Make sure your server returns:
- `Content-Type: application/json` for `.json` files

### File Permissions

Ensure files are readable by the web server:
```bash
chmod 644 /path/to/angus/bulk-files/*.json
```

### HTTPS

Use HTTPS for security. The app expects HTTPS URLs in the manifest.

## Example Workflow

1. **Create bulk file from your cache:**
   ```bash
   # Filter bulls from "Recommended Sires" category
   node scripts/create-bulk-file.js \
     --source ~/path/to/cache/ \
     --output recommended-sires-v1.0.0.json \
     --version 1.0.0 \
     --type recommended-sires \
     --category "Recommended Sires" \
     --filter "sex=BULL,category=Recommended Sires"
   ```

2. **Upload to server:**
   ```bash
   scp recommended-sires-v1.0.0.json user@scoring.westernsports.video:/path/to/angus/bulk-files/
   ```

3. **Create/update manifest.json** with the file details

4. **Upload manifest.json**

5. **Users check for updates** and import the file

## Troubleshooting

### Users can't see bulk files

- Check that `manifest.json` is accessible via the URL
- Verify the JSON is valid (use a JSON validator)
- Check server logs for errors

### Download fails

- Verify the bulk file URL is correct in manifest
- Check file permissions on server
- Verify the file exists at the URL
- Check for CORS or firewall issues

### Import fails

- Check that the bulk file JSON is valid
- Verify the file structure matches the expected format
- Check app console logs for error messages

## Notes

- The app checks for updates on startup (after 3 seconds)
- Users can manually check by clicking "Check for Updates"
- Files are processed once and converted to individual cache files
- Old bulk files can remain on the server (users won't download them unless they're in the manifest)

