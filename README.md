# Angus EPD Scraper

An Electron desktop application for scraping Expected Progeny Differences (EPD) data from the Angus.org website.

## Features

- **Automated Data Extraction**: Automates the search and data extraction process from Angus.org
- **Batch Processing**: Process multiple registration numbers at once with rate limiting
- **Test/Inspect Mode**: Preview page structure before scraping
- **Data Export**: Export results as JSON or CSV
- **User-Friendly UI**: Clean, modern interface built with Electron

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the application:
```bash
npm start
```

## Usage

1. Enter one or more registration numbers in the input field (separated by commas or new lines)
2. Click "Test/Inspect Page" to preview the page structure (optional, for debugging)
3. Click "Scrape EPD Data" to extract data
4. View results in the results section
5. Export data as JSON or CSV using the export buttons

## Building for Distribution

To create a distributable application:

```bash
npm run build
```

This will create platform-specific installers in the `dist` directory.

## Technical Details

The application uses Electron's `BrowserWindow` API to:
- Navigate to the Angus.org search page
- Automatically click the search button
- Wait for the redirect to the EPD results page
- Extract data from HTML tables and text content
- Handle session tokens and cookies automatically

## Notes

- The application includes rate limiting (2-3 second delays) between requests to avoid being blocked
- Make sure to comply with Angus.org's terms of service when using this tool
- The scraper handles JavaScript execution and session management automatically

